const express = require('express');
const fs = require('fs');
const path = require('path');
const { queryDigifarma } = require('./services/digifarma.service');
const { getGeoLocationFromIp } = require('./services/geoip.service');
const security = require('./security.js');

function formatarDataFirebird(date, isEnd = false) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
    const [yyyy, mm, dd] = date.trim().split('-');
    const hours = isEnd ? '23' : '00';
    const minutes = isEnd ? '59' : '00';
    const seconds = isEnd ? '59' : '00';
    return `${yyyy}-${mm}-${dd} ${hours}:${minutes}:${seconds}`;
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = isEnd ? '23' : '00';
  const minutes = isEnd ? '59' : '00';
  const seconds = isEnd ? '59' : '00';
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function roundUpToAcceptedCents(val) {
  if (isNaN(val) || val <= 0) return 0;
  let totalCents = Math.round(val * 100);
  let integerPart = Math.floor(totalCents / 100);
  let centsPart = totalCents % 100;

  let lastDigit = centsPart % 10;
  if (lastDigit === 0 || lastDigit === 5 || lastDigit === 9) {
    return totalCents / 100;
  }
  if (lastDigit > 0 && lastDigit < 5) {
    centsPart += (5 - lastDigit);
  } else if (lastDigit > 5 && lastDigit < 9) {
    centsPart += (9 - lastDigit);
  }

  return (integerPart * 100 + centsPart) / 100;
}

function getSemanaAno() {
  const d = new Date();
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getUltimoDiaDesteMes() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = agora.getMonth(); // 0 = Jan, 9 = Out, etc.
  const ultimoDia = new Date(ano, mes + 1, 0); // Dia 0 do próximo mês = último dia deste mês
  const yyyy = ultimoDia.getFullYear();
  const mm = String(ultimoDia.getMonth() + 1).padStart(2, '0');
  const dd = String(ultimoDia.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

module.exports = function (db) {
  const router = express.Router();

  // Migrações de colunas para liquidação
  try { db.exec('ALTER TABLE liquidacao_campanhas_itens ADD COLUMN preco_venda_original REAL DEFAULT 0'); } catch (e) {}
  try { db.exec('ALTER TABLE liquidacao_campanhas_itens ADD COLUMN preco_promocao_original REAL DEFAULT 0'); } catch (e) {}
  try { db.exec('ALTER TABLE liquidacao_campanhas_itens ADD COLUMN inicio_promocao_original TEXT'); } catch (e) {}
  try { db.exec('ALTER TABLE liquidacao_campanhas_itens ADD COLUMN termino_promocao_original TEXT'); } catch (e) {}
  try { db.exec('ALTER TABLE liquidacao_campanhas_itens ADD COLUMN dias_parado INTEGER DEFAULT 45'); } catch (e) {}
  try { db.exec('ALTER TABLE liquidacao_campanhas_itens ADD COLUMN selecionado INTEGER DEFAULT 0'); } catch (e) {}
  try { db.exec('ALTER TABLE liquidacao_campanhas_itens ADD COLUMN imagem_url TEXT'); } catch (e) {}
  try { db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN imagem_url TEXT'); } catch (e) {}

  // Tabela para vendas manuais de produtos não cadastrados (para abatimento direto de metas)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS liquidacao_vendas_manuais (
        id TEXT PRIMARY KEY,
        campanha_id TEXT NOT NULL,
        descricao TEXT NOT NULL,
        valor_total REAL NOT NULL,
        quantidade INTEGER DEFAULT 1,
        data_venda TEXT NOT NULL,
        observacao TEXT,
        registrado_por TEXT,
        created_at TEXT NOT NULL
      )
    `);
  } catch (e) {}

  // Helper para obter ou criar a campanha da semana ativa
  function getOrCreateCampanhaAtiva() {
    const semana = getSemanaAno();
    let campanha = db.prepare(`
      SELECT * FROM liquidacao_campanhas 
      WHERE status = 'ativa' 
      ORDER BY created_at DESC 
      LIMIT 1
    `).get();

    if (!campanha) {
      const id = 'camp_' + Date.now();
      const hoje = new Date();
      const em7Dias = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000);
      const dataInicio = hoje.toISOString().split('T')[0];
      const dataFim = em7Dias.toISOString().split('T')[0];

      db.prepare(`
        INSERT INTO liquidacao_campanhas (id, semana_ano, data_inicio, data_fim, meta_semanal, total_resgatado, status)
        VALUES (?, ?, ?, ?, 450.00, 0, 'ativa')
      `).run(id, semana, dataInicio, dataFim);

      campanha = db.prepare('SELECT * FROM liquidacao_campanhas WHERE id = ?').get(id);
    }

    return campanha;
  }

  // Cache de vendas em memória (15 segundos para evitar repetição concorrente ao carregar dashboard)
  let vendasCache = {
    campanhaId: null,
    timestamp: 0,
    data: null
  };

  async function calcularVendasCampanha(campanhaId, dataInicio, dataFim) {
    const items = db.prepare(`
      SELECT id, produto_id, preco_promocional, preco_normal, descricao, saldo_estoque 
      FROM liquidacao_campanhas_itens 
      WHERE campanha_id = ? AND status = 'ativo'
    `).all(campanhaId);

    const dtIni = dataInicio || '2026-10-05';
    const dtFim = dataFim || '2026-10-31';

    let vendasDetalhadas = [];
    const vendasPorProduto = {};
    let totalResgatado = 0;
    let totalItensVendidos = 0;

    if (items && items.length > 0) {
      const prodMap = new Map();
      items.forEach(it => prodMap.set(Number(it.produto_id), it));
      const prodIds = Array.from(prodMap.keys());

      const chunkSize = 60;
      for (let i = 0; i < prodIds.length; i += chunkSize) {
        const chunk = prodIds.slice(i, i + chunkSize);
        const sql = `
          SELECT 
            iv.PRODUTO_ID, 
            iv.ITEMVEND_QUANT,
            iv.ITEMVEND_PRVENDA,
            (iv.ITEMVEND_QUANT * iv.ITEMVEND_PRVENDA) as TOTAL_ITEM,
            v.VENDA_NOTA_ID,
            v.VENDA_DATA_HORA,
            p.PRODUTO as DESCRICAO,
            p.PROD_SALDO
          FROM ITEM_VENDAS iv
          JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
          JOIN PRODUTOS p ON iv.PRODUTO_ID = p.PRODUTO_ID
          WHERE iv.PRODUTO_ID IN (${chunk.join(',')})
            AND v.VENDA_DATA_HORA >= '${dtIni} 00:00:00'
            AND v.VENDA_DATA_HORA <= '${dtFim} 23:59:59'
            AND (v.CANCELADO IS NULL OR v.CANCELADO <> 'S')
            AND (iv.CANCELADO IS NULL OR iv.CANCELADO <> 'S')
          ORDER BY v.VENDA_DATA_HORA DESC
        `;
        try {
          const res = await queryDigifarma(sql, [], 8000);
          if (res && res.length > 0) {
            for (const r of res) {
              const pId = Number(r.PRODUTO_ID);
              const qtd = Number(r.ITEMVEND_QUANT) || 0;
              const total = Number(r.TOTAL_ITEM) || (qtd * Number(r.ITEMVEND_PRVENDA || 0));
              const it = prodMap.get(pId);

              totalResgatado += total;
              totalItensVendidos += qtd;

              if (!vendasPorProduto[pId]) {
                vendasPorProduto[pId] = { 
                  qtdVendida: 0, 
                  totalVendido: 0, 
                  saldoAtual: r.PROD_SALDO !== null && r.PROD_SALDO !== undefined ? Number(r.PROD_SALDO) : undefined 
                };
              }
              vendasPorProduto[pId].qtdVendida += qtd;
              vendasPorProduto[pId].totalVendido += total;
              if (r.PROD_SALDO !== null && r.PROD_SALDO !== undefined) {
                vendasPorProduto[pId].saldoAtual = Number(r.PROD_SALDO);
              }

              vendasDetalhadas.push({
                venda_nota_id: r.VENDA_NOTA_ID,
                venda_data_hora: r.VENDA_DATA_HORA,
                produto_id: pId,
                descricao: (r.DESCRICAO || it?.descricao || '').trim(),
                quantidade: qtd,
                preco_venda: Number(r.ITEMVEND_PRVENDA) || 0,
                total: Math.round(total * 100) / 100,
                preco_promocional_cadastrado: it?.preco_promocional || 0,
                is_manual: false
              });
            }
          }
        } catch (errChunk) {
          console.error('[Liquidação] Erro ao consultar chunk de vendas no Digifarma:', errChunk.message);
        }
      }
    }

    // Processa Vendas Manuais de Produtos Não Cadastrados
    try {
      const vendasManuais = db.prepare(`
        SELECT id, campanha_id, descricao, valor_total, quantidade, data_venda, observacao, registrado_por, created_at
        FROM liquidacao_vendas_manuais
        WHERE campanha_id = ?
        ORDER BY created_at DESC
      `).all(campanhaId);

      for (const vm of vendasManuais) {
        const total = Number(vm.valor_total) || 0;
        const qtd = Number(vm.quantidade) || 1;
        totalResgatado += total;
        totalItensVendidos += qtd;

        vendasDetalhadas.push({
          id: vm.id,
          venda_nota_id: `MANUAL-${vm.id.slice(-6).toUpperCase()}`,
          venda_data_hora: vm.data_venda || vm.created_at,
          produto_id: 0,
          descricao: vm.descricao,
          quantidade: qtd,
          preco_venda: Math.round((total / qtd) * 100) / 100,
          total: Math.round(total * 100) / 100,
          is_manual: true,
          observacao: vm.observacao || '',
          registrado_por: vm.registrado_por || 'Balcão'
        });
      }
    } catch (vmErr) {
      console.error('[Liquidação] Erro ao carregar vendas manuais:', vmErr.message);
    }

    // Ordena extrato pela data de venda mais recente
    vendasDetalhadas.sort((a, b) => new Date(b.venda_data_hora).getTime() - new Date(a.venda_data_hora).getTime());

    totalResgatado = Math.round(totalResgatado * 100) / 100;

    // Atualiza a tabela de campanhas no SQLite para persistência
    try {
      db.prepare(`UPDATE liquidacao_campanhas SET total_resgatado = ? WHERE id = ?`).run(totalResgatado, campanhaId);
    } catch (e) {}

    // Sincroniza saldo de estoque atualizado para os itens que tiveram venda no Digifarma
    if (items && items.length > 0) {
      try {
        const updateSaldoStmt = db.prepare(`UPDATE liquidacao_campanhas_itens SET saldo_estoque = ? WHERE id = ?`);
        for (const item of items) {
          const info = vendasPorProduto[Number(item.produto_id)];
          if (info && info.saldoAtual !== undefined && info.saldoAtual !== item.saldo_estoque) {
            updateSaldoStmt.run(info.saldoAtual, item.id);
          }
        }
      } catch (e) {}
    }

    return {
      totalResgatado,
      totalItensVendidos,
      totalVendasQtd: vendasDetalhadas.length,
      vendasDetalhadas,
      vendasPorProduto
    };
  }

  async function obterVendasCampanha(campanha, forcarAtualizacao = false) {
    const agora = Date.now();
    if (!forcarAtualizacao && vendasCache.data && vendasCache.campanhaId === campanha.id && (agora - vendasCache.timestamp < 15000)) {
      return vendasCache.data;
    }

    try {
      const resultado = await calcularVendasCampanha(campanha.id, campanha.data_inicio, campanha.data_fim);
      vendasCache = {
        campanhaId: campanha.id,
        timestamp: agora,
        data: resultado
      };
      return resultado;
    } catch (e) {
      console.error('[Liquidação] Falha ao obter vendas da campanha no Digifarma:', e.message);
      return {
        totalResgatado: campanha.total_resgatado || 0,
        totalItensVendidos: 0,
        totalVendasQtd: 0,
        vendasDetalhadas: [],
        vendasPorProduto: {}
      };
    }
  }

  // 0. GET /api/liquidacao/public/ofertas
  // Endpoint público para a Vitrine de Liquidação e Aniversário BelaFarma
  // Não requer autenticação administrativa. Alta performance via SQLite direto (< 50ms).
  const CATEGORIA_NOMES = {
    '1': 'Medicamentos de Referência',
    '2': 'Medicamentos Similares',
    '5': 'Perfumaria & Higiene',
    '6': 'Conveniência & Suplementos',
    '7': 'Medicamentos Genéricos'
  };

  function formatarCategoriaPublica(cat) {
    if (!cat) return 'Outros';
    const str = String(cat).trim();
    if (CATEGORIA_NOMES[str]) return CATEGORIA_NOMES[str];
    const upper = str.toUpperCase();
    if (upper.includes('PERFUM') || upper.includes('HIGIENE')) return 'Perfumaria & Higiene';
    if (upper.includes('SIMILAR')) return 'Medicamentos Similares';
    if (upper.includes('GENERIC')) return 'Medicamentos Genéricos';
    if (upper.includes('REFERENCIA') || upper.includes('REFERÊNCIA') || upper.includes('ETICO') || upper.includes('ÉTICO')) return 'Medicamentos de Referência';
    if (upper.includes('SUPLEMENT') || upper.includes('CONVENI') || upper.includes('OUTRO')) return 'Conveniência & Suplementos';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  function extrairLaboratorioPublico(descricao, fornecedor) {
    if (fornecedor && typeof fornecedor === 'string') {
      const fncLower = fornecedor.toLowerCase();
      if (!fncLower.includes('digifarma') && !fncLower.includes('cadastro geral') && !fncLower.includes('padrao')) {
        const cleaned = fornecedor.split(/[\s,-]/)[0];
        if (cleaned && cleaned.length > 2) {
          return cleaned.toUpperCase();
        }
      }
    }
    const descUpper = (descricao || '').toUpperCase();
    const labs = [
      'TEUTO', 'CIMED', 'MEDLEY', 'EMS', 'EUROFARMA', 'NEO QUIMICA', 'ACHE', 'NOVA QUIMICA',
      'MASSIME', 'SANTA RAIZ', 'BOZZANO', 'HIDRADERM', 'CLOSEUP', 'G-TECH', 'CENTRUM',
      'COLGATE', 'NIVEA', 'REXONA', 'PAMPERS', 'HUGGIES', 'CREMER', 'BIOTIN', 'BUSONID',
      'CALAMED', 'FLORAL THERAPI', 'DERMAFEME', 'HIDRABENE', 'LAVITAN', 'BIO INSTI', 'FARMAX'
    ];
    for (const lab of labs) {
      if (descUpper.includes(lab)) {
        return lab;
      }
    }
    return 'BelaFarma';
  }

  router.get('/public/ofertas', (req, res) => {
    try {
      let campanha = db.prepare(`
        SELECT * FROM liquidacao_campanhas 
        WHERE status IN ('ativa', 'ativo') 
        ORDER BY created_at DESC 
        LIMIT 1
      `).get();

      if (!campanha) {
        campanha = getOrCreateCampanhaAtiva();
      }

      if (!campanha) {
        return res.json({
          sucesso: true,
          campanha: {
            id: '',
            titulo: 'Aniversário & Grande Liquidação BelaFarma',
            data_inicio: new Date().toISOString().split('T')[0],
            data_fim: new Date().toISOString().split('T')[0]
          },
          total: 0,
          categorias: ['Todas'],
          produtos: []
        });
      }

      // Consulta direta e veloz no SQLite local sem Firebird
      const rows = db.prepare(`
        SELECT 
          lci.id,
          lci.produto_id,
          lci.descricao,
          lci.apresentacao,
          lci.ean,
          lci.categoria,
          COALESCE(cec.saldo, lci.saldo_estoque, 0) as estoque,
          lci.preco_normal,
          lci.preco_promocional,
          lci.desconto_percentual,
          lci.imagem_url,
          cec.ultima_compra_fornecedor
        FROM liquidacao_campanhas_itens lci
        LEFT JOIN compras_estoque_cache cec ON lci.produto_id = cec.produto_id
        WHERE lci.campanha_id = ? 
          AND lci.status IN ('ativo', 'ativa')
          AND COALESCE(cec.saldo, lci.saldo_estoque, 0) > 0
        ORDER BY lci.desconto_percentual DESC, lci.descricao ASC
      `).all(campanha.id);

      const todosProdutos = rows.map(r => {
        const precoDe = Math.round((Number(r.preco_normal) || 0) * 100) / 100;
        const precoPor = Math.round((Number(r.preco_promocional) || 0) * 100) / 100;
        let desconto = Math.round(Number(r.desconto_percentual) || 0);
        if (desconto <= 0 && precoDe > precoPor && precoDe > 0) {
          desconto = Math.round(((precoDe - precoPor) / precoDe) * 100);
        }

        const catFormatada = formatarCategoriaPublica(r.categoria);
        const lab = extrairLaboratorioPublico(r.descricao, r.ultima_compra_fornecedor);
        const est = Math.max(0, Math.floor(Number(r.estoque) || 0));
        const img = r.imagem_url || `/uploads/produtos/${r.produto_id}.jpg`;

        return {
          id: String(r.id),
          produto_id: Number(r.produto_id),
          nome: (r.descricao || '').trim(),
          descricao: (r.descricao || '').trim(),
          apresentacao: (r.apresentacao || '').trim(),
          ean: (r.ean || '').trim(),
          categoria: catFormatada,
          _categoria_raw: r.categoria ? String(r.categoria).trim() : '',
          laboratorio: lab,
          preco_de: precoDe,
          preco_por: precoPor,
          desconto_percentual: desconto,
          estoque: est,
          imagem_url: img
        };
      });

      // Lista única de categorias para filtros/tabs do frontend (sempre começando com 'Todas')
      const catSet = new Set();
      todosProdutos.forEach(p => {
        if (p.categoria && p.categoria !== 'Todas') {
          catSet.add(p.categoria);
        }
      });
      const categorias = ['Todas', ...Array.from(catSet)];

      // Filtros opcionais: categoria e busca (q / busca)
      const filtroCategoria = String(req.query.categoria || '').trim();
      const filtroBusca = String(req.query.q || req.query.busca || '').trim().toLowerCase();

      let produtosFiltrados = todosProdutos;

      if (filtroCategoria && filtroCategoria.toLowerCase() !== 'todas') {
        const catLower = filtroCategoria.toLowerCase();
        produtosFiltrados = produtosFiltrados.filter(p => 
          p.categoria.toLowerCase() === catLower ||
          p._categoria_raw.toLowerCase() === catLower ||
          p.categoria.toLowerCase().includes(catLower)
        );
      }

      if (filtroBusca) {
        produtosFiltrados = produtosFiltrados.filter(p =>
          p.nome.toLowerCase().includes(filtroBusca) ||
          p.descricao.toLowerCase().includes(filtroBusca) ||
          p.ean.toLowerCase().includes(filtroBusca) ||
          p.apresentacao.toLowerCase().includes(filtroBusca) ||
          p.laboratorio.toLowerCase().includes(filtroBusca) ||
          p.categoria.toLowerCase().includes(filtroBusca)
        );
      }

      // Remover campo interno auxiliar antes de enviar
      const produtosFormatados = produtosFiltrados.map(({ _categoria_raw, ...resto }) => resto);

      res.json({
        sucesso: true,
        campanha: {
          id: campanha.id,
          titulo: 'Aniversário & Grande Liquidação BelaFarma',
          data_inicio: campanha.data_inicio,
          data_fim: campanha.data_fim
        },
        total: produtosFormatados.length,
        categorias,
        produtos: produtosFormatados
      });
    } catch (err) {
      console.error('[Liquidação API] Erro em /public/ofertas:', err);
      res.status(500).json({ sucesso: false, error: err.message });
    }
  });

  // 1. GET /api/liquidacao/resumo
  // Retorna termômetro da dívida, meta semanal, progresso e extrato de vendas
  router.get('/resumo', async (req, res) => {
    try {
      const campanha = getOrCreateCampanhaAtiva();
      const forcarAtualizacao = req.query.refresh === 'true';

      const dadosVendas = await obterVendasCampanha(campanha, forcarAtualizacao);

      // Total de itens aprovados na campanha ativa
      const aprovados = db.prepare(`
        SELECT COUNT(*) as total 
        FROM liquidacao_campanhas_itens 
        WHERE campanha_id = ? AND status = 'ativo'
      `).get(campanha.id).total;

      // Itens pulados
      const pulados = db.prepare(`
        SELECT COUNT(*) as total 
        FROM liquidacao_itens_pulados 
        WHERE campanha_id = ?
      `).get(campanha.id).total;

      const DIVIDA_INICIAL_CHEQUE = 3500.00;
      const totalResgatadoGeral = dadosVendas.totalResgatado;
      const saldoRestanteDivida = Math.max(0, DIVIDA_INICIAL_CHEQUE - totalResgatadoGeral);

      const percentualDivida = Number(((totalResgatadoGeral / DIVIDA_INICIAL_CHEQUE) * 100).toFixed(1));
      const meta = campanha.meta_semanal || 3500.00;
      const percentualMeta = Number(((totalResgatadoGeral / meta) * 100).toFixed(1));

      res.json({
        dividaInicial: DIVIDA_INICIAL_CHEQUE,
        saldoRestanteDivida: Math.round(saldoRestanteDivida * 100) / 100,
        percentualDividaPaga: Math.min(100, percentualDivida),
        campanha: {
          id: campanha.id,
          semana: campanha.semana_ano,
          dataInicio: campanha.data_inicio,
          dataFim: campanha.data_fim,
          metaSemanal: meta,
          totalResgatado: totalResgatadoGeral,
          percentualMetaSemanal: Math.min(100, percentualMeta),
          totalItensVendidos: dadosVendas.totalItensVendidos,
          totalVendasQtd: dadosVendas.totalVendasQtd
        },
        progressoSelecao: {
          aprovados,
          meta: 20,
          completo: false, // Sem trava: o usuário pode liquidar o máximo possível
          pulados
        },
        vendasDetalhadas: dadosVendas.vendasDetalhadas
      });
    } catch (err) {
      console.error('[Liquidação API] Erro em /resumo:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 2. GET /api/liquidacao/proximo-item
  // Busca o próximo candidato parado há mais de 90 dias para aprovação Um a Um
  router.get('/proximo-item', async (req, res) => {
    try {
      const campanha = getOrCreateCampanhaAtiva();
      const catParam = req.query.categoria ? String(req.query.categoria).trim().toUpperCase() : 'TODOS';

      // IDs já aprovados ou pulados nesta campanha
      const ignorarIdsRows = db.prepare(`
        SELECT produto_id FROM liquidacao_campanhas_itens WHERE status = 'ativo'
        UNION
        SELECT produto_id FROM liquidacao_itens_pulados WHERE campanha_id = ?
      `).all(campanha.id);
      const ignorarIds = new Set(ignorarIdsRows.map(r => Number(r.produto_id)));

      // 1ª Tentativa: Mural de produtos parados (> 90d) com filtro de categoria
      let muralWhere = "WHERE status = 'pendente' AND saldo > 0 AND preco_venda > 0";
      const muralParams = [];
      if (catParam && catParam !== 'TODOS') {
        if (catParam === 'OUTROS') {
          muralWhere += " AND (UPPER(categoria) NOT IN ('PERFUMARIA', 'GENERICO', 'MARCA', 'SIMILAR') OR categoria IS NULL)";
        } else {
          muralWhere += " AND UPPER(categoria) = ?";
          muralParams.push(catParam);
        }
      }

      let candidatos = db.prepare(`
        SELECT 
          produto_id, descricao, cod_barras, apresentacao, categoria,
          saldo, preco_venda, preco_compra, valor_total_parado, dias_parado
        FROM mural_produtos_parados
        ${muralWhere}
        ORDER BY valor_total_parado DESC, saldo DESC
        LIMIT 100
      `).all(...muralParams);

      let candidatosFiltrados = candidatos.filter(c => !ignorarIds.has(Number(c.produto_id)));

      // 2ª Tentativa (fallback): Se não encontrou no mural, busca no compras_estoque_cache itens sem venda 90d E comprados há mais de 90d
      if (candidatosFiltrados.length === 0) {
        let fbWhere = `
          WHERE saldo > 0 
            AND preco_normal > 0
            AND (vendas_30d = 0 OR vendas_30d IS NULL)
            AND (vendas_31_60d = 0 OR vendas_31_60d IS NULL)
            AND (vendas_61_90d = 0 OR vendas_61_90d IS NULL)
            AND ultima_compra_data IS NOT NULL 
            AND date(ultima_compra_data) <= date('now', '-90 days')
        `;
        const fbParams = [];
        if (catParam && catParam !== 'TODOS') {
          if (catParam === 'PERFUMARIA') {
            fbWhere += ` AND (categoria_id LIKE '%PERF%' OR UPPER(descricao) LIKE '%SHAMPOO%' OR UPPER(descricao) LIKE '%SABONETE%' OR UPPER(descricao) LIKE '%DESOD%' OR UPPER(descricao) LIKE '%CREME%' OR UPPER(descricao) LIKE '%FRALDA%')`;
          } else if (catParam === 'GENERICO') {
            fbWhere += ` AND (categoria_id LIKE '%GEN%' OR UPPER(descricao) LIKE '%GENERICO%' OR UPPER(descricao) LIKE '%GEN%')`;
          } else if (catParam === 'MARCA') {
            fbWhere += ` AND (categoria_id NOT LIKE '%PERF%' AND categoria_id NOT LIKE '%GEN%')`;
          }
        }

        const fallbackCandidatos = db.prepare(`
          SELECT 
            produto_id, descricao, ean as cod_barras, apresentacao, categoria_id as categoria,
            saldo, preco_normal as preco_venda, 
            COALESCE(NULLIF(custo_unitario, 0), NULLIF(ultima_compra_valor, 0), 0) as preco_compra,
            (saldo * preco_normal) as valor_total_parado,
            90 as dias_parado
          FROM compras_estoque_cache
          ${fbWhere}
          ORDER BY valor_total_parado DESC
          LIMIT 100
        `).all(...fbParams);

        candidatosFiltrados = fallbackCandidatos.filter(c => !ignorarIds.has(Number(c.produto_id)));
      }

      // Validação ativa contra compras recentes no Firebird
      let itemEscolhido = null;
      let fbData = null;

      for (const cand of candidatosFiltrados) {
        const candId = Number(cand.produto_id);

        // Checagem no Firebird: Houve nota de entrada nos últimos 90 dias?
        let teveEntradaRecente = false;
        try {
          const checkEntrada = await queryDigifarma(
            `SELECT FIRST 1 inp.PRODUTO_ID 
             FROM ITEM_NOTAS inp
             JOIN CAB_NOTAS cnp ON inp.CAB_NOTA_ID = cnp.CAB_NOTA_ID
             WHERE inp.PRODUTO_ID = ? AND cnp.ENTRADA_SAIDA = 'E'
               AND (cnp.CANCELAMENTO = 'N' OR cnp.CANCELAMENTO IS NULL)
               AND cnp.DATA_EMISSAO >= CAST('NOW' AS TIMESTAMP) - 90`,
            [candId],
            4000
          );
          if (checkEntrada && checkEntrada.length > 0) {
            teveEntradaRecente = true;
          }
        } catch (errCheck) {
          // Em caso de falha de conexão temporária, prossegue
        }

        if (teveEntradaRecente) {
          console.warn(`[Liquidação API] ⚠️ Produto ${candId} (${cand.descricao}) possui compra recente (<90d). Descartando.`);
          try {
            db.prepare("UPDATE mural_produtos_parados SET status = 'ignorado_compra_recente' WHERE produto_id = ?").run(candId);
          } catch (e) {}
          ignorarIds.add(candId);
          continue;
        }

        // Consulta dados atualizados do produto no Firebird
        try {
          const fbRows = await queryDigifarma(
            'SELECT PRODUTO_ID, PRODUTO, COD_BARRAS, PROD_SALDO, PROD_PRVENDA, PROD_PRPROMOCAO, INICIO_PROMOCAO, TERMINO_PROMOCAO, PROD_PRCOMPRA, PROD_CMV, VALOR_ULT_COMPRA FROM PRODUTOS WHERE PRODUTO_ID = ?',
            [candId],
            6000
          );
          if (fbRows && fbRows.length > 0) {
            fbData = fbRows[0];
          }
        } catch (errFb) {
          console.warn(`[Liquidação API] Consulta Firebird para produto ${candId} falhou, usando cache SQLite:`, errFb.message);
        }

        itemEscolhido = cand;
        break;
      }

      if (!itemEscolhido) {
        return res.json({
          disponivel: false,
          mensagem: 'Nenhum outro produto parado há mais de 90 dias (sem compras recentes) encontrado para liquidação no momento.'
        });
      }

      const pId = Number(itemEscolhido.produto_id);

      const saldoAtual = fbData ? Number(fbData.PROD_SALDO) : (Number(itemEscolhido.saldo) || 0);
      const prVendaTabela = fbData ? Number(fbData.PROD_PRVENDA) : (Number(itemEscolhido.preco_venda) || 0);
      const prPromocionalAtual = fbData ? Number(fbData.PROD_PRPROMOCAO) : 0;

      // Se o produto já estiver em promoção no Digifarma, o preço de venda efetivo é o promocional!
      const precoVendaVigente = (prPromocionalAtual > 0) ? prPromocionalAtual : prVendaTabela;
      const temPromocaoAtiva = prPromocionalAtual > 0;

      // Apuração do Preço de Custo Real Unitário (corrige distorções de caixa fechada vs unidade fracionada)
      let precoCusto = 0;
      if (fbData && Number(fbData.PROD_CMV) > 0) {
        precoCusto = Number(fbData.PROD_CMV);
      } else if (fbData && Number(fbData.VALOR_ULT_COMPRA) > 0) {
        precoCusto = Number(fbData.VALOR_ULT_COMPRA);
      }

      if (precoCusto <= 0) {
        const uc = db.prepare('SELECT preco_unitario_ult_compra FROM digifarma_ultimas_compras_cache WHERE produto_id = ?').get(pId);
        if (uc && Number(uc.preco_unitario_ult_compra) > 0) {
          precoCusto = Number(uc.preco_unitario_ult_compra);
        }
      }

      // Se custo for maior que o preço de venda atual, ajusta para o custo unitário correto
      if (precoCusto <= 0 || precoCusto >= precoVendaVigente) {
        if (fbData && Number(fbData.PROD_CMV) > 0 && Number(fbData.PROD_CMV) < precoVendaVigente) {
          precoCusto = Number(fbData.PROD_CMV);
        } else {
          precoCusto = Number((precoVendaVigente * 0.60).toFixed(2));
        }
      }

      // Regra aprovada pelo usuário: Preço de Custo + Simples (7%)
      const taxaSimples = 0.07;
      let precoSugerido = roundUpToAcceptedCents(precoCusto * (1 + taxaSimples));

      // A sugestão deve ser SEMPRE inferior ao preço vigente atual para criar a queima real!
      if (precoSugerido >= precoVendaVigente) {
        precoSugerido = roundUpToAcceptedCents(precoVendaVigente * 0.80);
      }
      if (precoSugerido <= 0) {
        precoSugerido = roundUpToAcceptedCents(precoVendaVigente * 0.70);
      }

      const descontoReais = Math.max(0, precoVendaVigente - precoSugerido);
      const descontoPercentual = precoVendaVigente > 0 
        ? Math.round((descontoReais / precoVendaVigente) * 100) 
        : 0;

      const valorTotalImobilizado = Number((saldoAtual * precoVendaVigente).toFixed(2));

      // Datas padrão de vigência: Início hoje, Término no último dia deste mês
      const hoje = new Date();
      const terminoStr = getUltimoDiaDesteMes();

      res.json({
        disponivel: true,
        produto: {
          produto_id: pId,
          descricao: (fbData && fbData.PRODUTO) || itemEscolhido.descricao,
          apresentacao: itemEscolhido.apresentacao || '',
          cod_barras: (fbData && fbData.COD_BARRAS) || itemEscolhido.cod_barras || '',
          categoria: itemEscolhido.categoria || 'Geral',
          saldo: saldoAtual,
          preco_custo: precoCusto,
          preco_tabela: prVendaTabela,
          preco_normal: precoVendaVigente,
          tem_promocao_ativa: temPromocaoAtiva,
          preco_promocional_atual: prPromocionalAtual,
          preco_sugerido: precoSugerido,
          desconto_reais: descontoReais,
          desconto_percentual: descontoPercentual,
          valor_total_parado: valorTotalImobilizado,
          dias_parado: itemEscolhido.dias_parado || 90,
          vigencia_padrao: {
            data_inicio: hoje.toISOString().split('T')[0],
            data_termino: terminoStr
          }
        }
      });
    } catch (err) {
      console.error('[Liquidação API] Erro em /proximo-item:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 3. POST /api/liquidacao/aplicar
  // Grava o preço promocional no Digifarma Firebird e atualiza caches locais
  router.post('/aplicar', async (req, res) => {
    try {
      const { 
        produto_id, 
        preco_promocional, 
        data_inicio, 
        data_termino, 
        aprovado_por 
      } = req.body;

      if (!produto_id || !preco_promocional || !data_inicio || !data_termino) {
        return res.status(400).json({ error: 'Parâmetros incompletos (produto_id, preco_promocional, data_inicio, data_termino).' });
      }

      const campanha = getOrCreateCampanhaAtiva();
      const pId = Number(produto_id);
      const prPromo = parseFloat(preco_promocional);

      // Busca dados atuais do produto para snapshot
      const cacheProd = db.prepare(`
        SELECT produto_id, descricao, ean as cod_barras, apresentacao, categoria_id, saldo, preco_normal, custo_unitario
        FROM compras_estoque_cache
        WHERE produto_id = ?
      `).get(pId) || db.prepare(`
        SELECT produto_id, descricao, cod_barras, apresentacao, categoria, saldo, preco_venda as preco_normal, preco_compra as custo_unitario
        FROM mural_produtos_parados
        WHERE produto_id = ?
      `).get(pId) || { produto_id: pId, descricao: `Produto #${pId}`, preco_normal: prPromo * 1.3, custo_unitario: prPromo * 0.9 };

      const precoNormal = Number(cacheProd.preco_normal) || prPromo;
      const precoCusto = Number(cacheProd.custo_unitario) || (prPromo * 0.9);
      // 1. Antes de sobrescrever, captura valores originais existentes no Firebird
      let precoPromoOriginal = 0;
      let inicioPromoOriginal = null;
      let terminoPromoOriginal = null;
      try {
        const prodAtualFb = await queryDigifarma(
          "SELECT PROD_PRPROMOCAO, INICIO_PROMOCAO, TERMINO_PROMOCAO FROM PRODUTOS WHERE PRODUTO_ID = ?",
          [pId],
          3000
        );
        if (prodAtualFb && prodAtualFb.length > 0) {
          precoPromoOriginal = Number(prodAtualFb[0].PROD_PRPROMOCAO) || 0;
          inicioPromoOriginal = prodAtualFb[0].INICIO_PROMOCAO || null;
          terminoPromoOriginal = prodAtualFb[0].TERMINO_PROMOCAO || null;
        }
      } catch (e) {
        console.warn(`[Liquidação API] Não foi possível obter preço promocional prévio do produto ${pId}:`, e.message);
      }

      // Se o produto já tinha preço promocional ativo, o preço normal praticado é esse valor promocional!
      const precoVendaRealPraticado = precoPromoOriginal > 0 ? precoPromoOriginal : precoNormal;
      const descontoPct = precoVendaRealPraticado > 0 ? Math.round(((precoVendaRealPraticado - prPromo) / precoVendaRealPraticado) * 100) : 0;

      // 2. Grava no Digifarma Firebird
      let firebirdOk = false;
      const fbInicio = formatarDataFirebird(data_inicio, false);
      const fbTermino = formatarDataFirebird(data_termino, true);

      try {
        await queryDigifarma(
          `UPDATE PRODUTOS 
           SET PROD_PRPROMOCAO = ?, 
               INICIO_PROMOCAO = ?, 
               TERMINO_PROMOCAO = ? 
           WHERE PRODUTO_ID = ?`,
          [prPromo, fbInicio, fbTermino, pId]
        );
        firebirdOk = true;
        console.log(`[Liquidação API] ✅ Promoção aplicada no Digifarma Firebird para produto ${pId}: R$ ${prPromo} (${fbInicio} até ${fbTermino})`);
      } catch (fbErr) {
        console.warn(`[Liquidação API] ⚠️ Aviso: Não foi possível sincronizar imediatamente com Firebird (${fbErr.message}). Promoção gravada no cache SQLite local.`);
      }

      // 3. Grava na tabela de itens da campanha
      const itemId = 'liq_' + pId + '_' + Date.now();
      db.prepare(`
        INSERT OR REPLACE INTO liquidacao_campanhas_itens (
          id, campanha_id, produto_id, descricao, apresentacao, ean, categoria,
          saldo_estoque, preco_custo, preco_normal, preco_promocional, desconto_percentual,
          data_inicio, data_termino, status, sincronizado_digifarma, aprovado_por,
          preco_promocao_original, inicio_promocao_original, termino_promocao_original
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, 'ativo', ?, ?,
          ?, ?, ?
        )
      `).run(
        itemId, campanha.id, pId, cacheProd.descricao, cacheProd.apresentacao || '', cacheProd.cod_barras || '', String(cacheProd.categoria || 'Geral'),
        Number(cacheProd.saldo) || 0, precoCusto, precoVendaRealPraticado, prPromo, descontoPct,
        data_inicio, data_termino, firebirdOk ? 1 : 0, aprovado_por || 'Edevaldo Cruz',
        precoPromoOriginal, inicioPromoOriginal, terminoPromoOriginal
      );

      // 3. Atualiza caches SQLite
      try {
        db.prepare(`
          UPDATE compras_estoque_cache 
          SET preco_promocional = ?, inicio_promocao = ?, termino_promocao = ?
          WHERE produto_id = ?
        `).run(prPromo, data_inicio, data_termino, pId);
      } catch (e) {}

      try {
        db.prepare(`
          UPDATE digifarma_products_cache 
          SET preco_promocao = ?, inicio_promocao = ?, termino_promocao = ?
          WHERE produto_id = ?
        `).run(prPromo, data_inicio, data_termino, pId);
      } catch (e) {}

      // 4. Marca no mural_produtos_parados como resolvido
      try {
        db.prepare(`
          UPDATE mural_produtos_parados 
          SET status = 'resolvido', 
              acao_tomada = 'Liquidação Queima de Estoque',
              acao_detalhe = ?,
              data_resolucao = datetime('now'),
              resolvido_por = ?
          WHERE produto_id = ?
        `).run(`Preço promocional R$ ${prPromo.toFixed(2)} até ${data_termino}`, aprovado_por || 'Edevaldo Cruz', pId);
      } catch (e) {}

      // Retorna sucesso e total atual de itens aprovados
      const totalAprovados = db.prepare(`
        SELECT COUNT(*) as total 
        FROM liquidacao_campanhas_itens 
        WHERE campanha_id = ? AND status = 'ativo'
      `).get(campanha.id).total;

      res.json({
        success: true,
        message: `Produto ${cacheProd.descricao} inserido na Liquidação com sucesso por R$ ${prPromo.toFixed(2)}!`,
        firebirdSincronizado: firebirdOk,
        totalAprovados,
        metaAtingida: totalAprovados >= 20
      });
    } catch (err) {
      console.error('[Liquidação API] Erro em /aplicar:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 4. POST /api/liquidacao/pular
  // Pula o produto atual para substituí-lo na fila
  router.post('/pular', (req, res) => {
    try {
      const { produto_id } = req.body;
      if (!produto_id) return res.status(400).json({ error: 'produto_id é obrigatório.' });

      const campanha = getOrCreateCampanhaAtiva();
      db.prepare(`
        INSERT OR REPLACE INTO liquidacao_itens_pulados (produto_id, campanha_id)
        VALUES (?, ?)
      `).run(Number(produto_id), campanha.id);

      res.json({ success: true, message: 'Produto pulado com sucesso.' });
    } catch (err) {
      console.error('[Liquidação API] Erro em /pular:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 4.9 POST /api/liquidacao/carregar-todos-45d
  // Reinicia a lista da campanha carregando todos os produtos parados há 45+ dias ordenados por criticidade
  router.post('/carregar-todos-45d', async (req, res) => {
    try {
      const campanha = getOrCreateCampanhaAtiva();

      // Consulta no Digifarma Firebird produtos verdadeiramente parados há 45+ dias:
      // 1. Ativos e com Saldo > 0
      // 2. NENHUMA venda nos últimos 45 dias (evita itens de giro como Metrexato e Sonrisal)
      // 3. NENHUMA entrada/compra nos últimos 45 dias (evita itens novos/repostos como Eno Laranja)
      // 4. TEVE entrada no passado há mais de 45 dias (garante tempo de loja >= 45 dias)
      const sqlParados = `
        SELECT 
          p.PRODUTO_ID,
          p.PRODUTO as DESCRICAO,
          p.APRESENTACAO,
          p.COD_BARRAS as EAN,
          p.PROD_SALDO as SALDO,
          p.PROD_PRVENDA,
          p.PROD_PRPROMOCAO,
          p.INICIO_PROMOCAO,
          p.TERMINO_PROMOCAO,
          COALESCE(NULLIF(p.PROD_CMV, 0), NULLIF(p.PROD_PRCOMPRA, 0), NULLIF(p.VALOR_ULT_COMPRA, 0), 0) as PRECO_CUSTO,
          c.CATEGORIA as CATEGORIA_NOME,
          (
            SELECT MAX(v.VENDA_DATA_HORA)
            FROM ITEM_VENDAS iv
            JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
            WHERE iv.PRODUTO_ID = p.PRODUTO_ID AND (v.CANCELADO IS NULL OR v.CANCELADO <> 'S')
          ) as ULTIMA_VENDA,
          (
            SELECT MAX(cnp.DATA_EMISSAO)
            FROM ITEM_NOTAS inp
            JOIN CAB_NOTAS cnp ON inp.CAB_NOTA_ID = cnp.CAB_NOTA_ID
            WHERE inp.PRODUTO_ID = p.PRODUTO_ID AND cnp.ENTRADA_SAIDA = 'E'
              AND (cnp.CANCELAMENTO IS NULL OR cnp.CANCELAMENTO = 'N')
          ) as ULTIMA_COMPRA
        FROM PRODUTOS p
        LEFT JOIN CATEGORIA c ON p.CATEGORIA_ID = c.CATEGORIA_ID
        WHERE p.PROD_ATIVO = 'S'
          AND p.PROD_SALDO > 0
          AND NOT EXISTS (
            SELECT FIRST 1 1 
            FROM ITEM_VENDAS iv
            JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
            WHERE iv.PRODUTO_ID = p.PRODUTO_ID 
              AND (v.CANCELADO IS NULL OR v.CANCELADO <> 'S')
              AND v.VENDA_DATA_HORA >= CAST('NOW' AS TIMESTAMP) - 45
          )
          AND NOT EXISTS (
            SELECT FIRST 1 1 
            FROM ITEM_NOTAS inp
            JOIN CAB_NOTAS cnp ON inp.CAB_NOTA_ID = cnp.CAB_NOTA_ID
            WHERE inp.PRODUTO_ID = p.PRODUTO_ID AND cnp.ENTRADA_SAIDA = 'E'
              AND (cnp.CANCELAMENTO IS NULL OR cnp.CANCELAMENTO = 'N')
              AND (cnp.DATA_EMISSAO >= CAST('NOW' AS TIMESTAMP) - 45 OR cnp.DATA_RECEBIMENTO >= CAST('NOW' AS TIMESTAMP) - 45)
          )
          AND EXISTS (
            SELECT FIRST 1 1 
            FROM ITEM_NOTAS iant
            JOIN CAB_NOTAS cant ON iant.CAB_NOTA_ID = cant.CAB_NOTA_ID
            WHERE iant.PRODUTO_ID = p.PRODUTO_ID AND cant.ENTRADA_SAIDA = 'E'
              AND (cant.CANCELAMENTO IS NULL OR cant.CANCELAMENTO = 'N')
              AND cant.DATA_EMISSAO < CAST('NOW' AS TIMESTAMP) - 45
          )
        ORDER BY (p.PROD_SALDO * COALESCE(p.PROD_CMV, p.PROD_PRCOMPRA, p.VALOR_ULT_COMPRA, p.PROD_PRVENDA, 0)) DESC
      `;

      let prods = [];
      try {
        prods = await queryDigifarma(sqlParados, [], 45000);
      } catch (errFb) {
        console.error('[Liquidação API] Erro ao buscar produtos parados no Digifarma:', errFb.message);
        return res.status(500).json({ error: 'Erro ao consultar produtos parados no Digifarma: ' + errFb.message });
      }

      if (!prods || prods.length === 0) {
        return res.json({ success: true, count: 0, message: 'Nenhum produto parado há 45+ dias encontrado.' });
      }

      const dataInicio = new Date().toISOString().split('T')[0];
      const dataTermino = getUltimoDiaDesteMes();
      const agoraMs = Date.now();

      // Limpa os itens anteriores da campanha ativa para reiniciar a lista
      db.prepare("DELETE FROM liquidacao_campanhas_itens WHERE campanha_id = ?").run(campanha.id);

      const insertStmt = db.prepare(`
        INSERT INTO liquidacao_campanhas_itens (
          id, campanha_id, produto_id, descricao, apresentacao, ean, categoria,
          saldo_estoque, preco_custo, preco_normal, preco_promocional, desconto_percentual,
          data_inicio, data_termino, status, sincronizado_digifarma, aprovado_por,
          preco_promocao_original, inicio_promocao_original, termino_promocao_original,
          dias_parado
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, 'ativo', 0, 'Sistema (45+ dias)',
          ?, ?, ?,
          ?
        )
      `);

      let count = 0;
      const insertMany = db.transaction((items) => {
        for (const item of items) {
          insertStmt.run(
            String(item.id),
            String(item.campanha_id),
            Number(item.produto_id),
            String(item.descricao || ''),
            String(item.apresentacao || ''),
            String(item.ean || ''),
            String(item.categoria || 'Geral'),
            Number(item.saldo_estoque) || 0,
            Number(item.preco_custo) || 0,
            Number(item.preco_normal) || 0,
            Number(item.preco_promocional) || 0,
            Number(item.desconto_percentual) || 0,
            String(item.data_inicio),
            String(item.data_termino),
            item.preco_promocao_original != null ? Number(item.preco_promocao_original) : 0,
            item.inicio_promocao_original ? String(item.inicio_promocao_original) : null,
            item.termino_promocao_original ? String(item.termino_promocao_original) : null,
            Number(item.dias_parado) || 45
          );
          count++;
        }
      });

      const batchToInsert = [];
      for (const p of prods) {
        const saldoReal = Number(p.SALDO) || 0;
        if (saldoReal <= 0) continue;

        const fbPromo = p.PROD_PRPROMOCAO != null ? Number(Number(p.PROD_PRPROMOCAO).toFixed(2)) : 0;
        const fbVenda = p.PROD_PRVENDA != null ? Number(Number(p.PROD_PRVENDA).toFixed(2)) : 0;
        
        // Valor original praticado: se tem promocional prévio, usa ele; senão usa venda de tabela
        const precoNormal = fbPromo > 0 ? fbPromo : fbVenda;
        if (precoNormal <= 0) continue;

        // Cálculo real de dias parado:
        // Prioridade 1: Dias desde a última venda
        // Prioridade 2: Dias desde a compra / recebimento da nota (para itens que nunca venderam)
        let dias = 45;
        if (p.ULTIMA_VENDA) {
          const diffV = Math.floor((agoraMs - new Date(p.ULTIMA_VENDA).getTime()) / (1000 * 60 * 60 * 24));
          dias = Math.max(45, diffV);
        } else if (p.ULTIMA_COMPRA) {
          const diffC = Math.floor((agoraMs - new Date(p.ULTIMA_COMPRA).getTime()) / (1000 * 60 * 60 * 24));
          dias = Math.max(45, diffC);
        }

        const precoCusto = Number((Number(p.PRECO_CUSTO) || 0).toFixed(2));

        // 3 Faixas de desconto sugeridas nominais:
        let descPctNominal = 30;
        if (dias > 180) {
          descPctNominal = 70;
        } else if (dias >= 91) {
          descPctNominal = 50;
        } else {
          descPctNominal = 30;
        }

        const precoCalculado = Math.round(precoNormal * (1 - descPctNominal / 100) * 100) / 100;
        
        // REGRA DE BLINDAGEM: A sugestão NUNCA pode ficar abaixo do preço de custo
        const pisoCusto = precoCusto > 0 ? precoCusto : 0.10;
        let precoPromo = Math.max(pisoCusto, precoCalculado);
        if (precoNormal < precoPromo) {
          precoPromo = precoNormal;
        }

        // Desconto real efetivo sem prejuízo
        const descReal = precoNormal > 0 ? Math.max(0, Math.round(((precoNormal - precoPromo) / precoNormal) * 100)) : 0;

        batchToInsert.push({
          id: 'liq_' + p.PRODUTO_ID + '_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          campanha_id: campanha.id,
          produto_id: p.PRODUTO_ID,
          descricao: p.DESCRICAO || '',
          apresentacao: p.APRESENTACAO || '',
          ean: p.EAN || '',
          categoria: p.CATEGORIA_NOME || 'Geral',
          saldo_estoque: saldoReal,
          preco_custo: precoCusto,
          preco_normal: precoNormal,
          preco_promocional: precoPromo,
          desconto_percentual: descReal,
          data_inicio: dataInicio,
          data_termino: dataTermino,
          preco_promocao_original: fbPromo,
          inicio_promocao_original: p.INICIO_PROMOCAO || null,
          termino_promocao_original: p.TERMINO_PROMOCAO || null,
          dias_parado: dias
        });
      }

      insertMany(batchToInsert);

      res.json({
        success: true,
        message: `Lista inicializada com sucesso com ${count} produtos parados há 45+ dias!`,
        total: count
      });
    } catch (err) {
      console.error('[Liquidação API] Erro em /carregar-todos-45d:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 5. GET /api/liquidacao/itens-ativos
  // Retorna os produtos selecionados para a campanha com dias parado, vendas realizadas e sugestões inteligentes
  router.get('/itens-ativos', async (req, res) => {
    try {
      const campanha = getOrCreateCampanhaAtiva();
      const forcarAtualizacao = req.query.refresh === 'true';
      const dadosVendas = await obterVendasCampanha(campanha, forcarAtualizacao);
      const vendasMap = dadosVendas.vendasPorProduto || {};

      const rows = db.prepare(`
        SELECT 
          lci.*,
          COALESCE(cec.saldo, lci.saldo_estoque, 0) as saldo_estoque,
          COALESCE(NULLIF(lci.preco_custo, 0), NULLIF(cec.custo_unitario, 0), NULLIF(cec.ultima_compra_valor, 0), 0) as preco_custo,
          COALESCE(lci.dias_parado, 45) as dias_parado
        FROM liquidacao_campanhas_itens lci
        LEFT JOIN compras_estoque_cache cec ON lci.produto_id = cec.produto_id
        WHERE lci.campanha_id = ? AND lci.status = 'ativo'
        GROUP BY lci.id
        ORDER BY lci.rowid DESC
      `).all(campanha.id);

      const itens = rows.map(item => {
        const dias = (item.dias_parado !== null && item.dias_parado !== undefined) ? Number(item.dias_parado) : 45;
        let sugestao = 30;
        let motivoSugestao = '';

        if (dias > 180) {
          sugestao = 70;
          motivoSugestao = `Parado há ${dias} dias (> 6 meses). Queima total de 1º Aniversário (70%) para evitar perda total por vencimento e juros corrosivos.`;
        } else if (dias >= 91) {
          sugestao = 50;
          motivoSugestao = `Parado há ${dias} dias (3 a 6 meses). Sugestão de 50% cria gatilho de 'metade do preço' e resgate imediato de capital.`;
        } else if (dias >= 45) {
          sugestao = 30;
          motivoSugestao = `Parado há ${dias} dias (1,5 a 3 meses). Sugestão de 30% acelera o giro mantendo margem segura.`;
        } else {
          sugestao = 30;
          motivoSugestao = `Produto avulso incluído livremente do estoque.`;
        }

        const infoVenda = vendasMap[Number(item.produto_id)];

        return {
          ...item,
          dias_parado: dias,
          sugestao_desconto: sugestao,
          motivo_sugestao: motivoSugestao,
          selecionado: Number(item.selecionado) === 1,
          qtd_vendida: infoVenda ? infoVenda.qtdVendida : 0,
          total_vendido: infoVenda ? Math.round(infoVenda.totalVendido * 100) / 100 : 0
        };
      });

      res.json({
        campanhaId: campanha.id,
        total: itens.length,
        totalResgatado: dadosVendas.totalResgatado,
        totalItensVendidos: dadosVendas.totalItensVendidos,
        itens
      });
    } catch (err) {
      console.error('[Liquidação API] Erro em /itens-ativos:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 5.01 POST /api/liquidacao/toggle-selecionado
  // Alterna o status de seleção do produto para aplicação promocional e geração de etiqueta
  router.post('/toggle-selecionado', (req, res) => {
    try {
      const { id, selecionado } = req.body;
      if (!id) return res.status(400).json({ error: 'id é obrigatório' });
      const val = selecionado ? 1 : 0;
      db.prepare('UPDATE liquidacao_campanhas_itens SET selecionado = ? WHERE id = ?').run(val, id);
      res.json({ success: true, id, selecionado: val === 1 });
    } catch (err) {
      console.error('[Liquidação API] Erro em /toggle-selecionado:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 5.02 POST /api/liquidacao/selecionar-todos
  // Marca ou desmarca múltiplos itens de uma vez
  router.post('/selecionar-todos', (req, res) => {
    try {
      const { campanha_id, selecionado, ids } = req.body;
      const campanha = campanha_id ? { id: campanha_id } : getOrCreateCampanhaAtiva();
      const val = selecionado ? 1 : 0;
      if (Array.isArray(ids) && ids.length > 0) {
        const stmt = db.prepare('UPDATE liquidacao_campanhas_itens SET selecionado = ? WHERE id = ?');
        const updateMany = db.transaction((idList) => {
          for (const itId of idList) {
            stmt.run(val, itId);
          }
        });
        updateMany(ids);
      } else {
        db.prepare('UPDATE liquidacao_campanhas_itens SET selecionado = ? WHERE campanha_id = ?').run(val, campanha.id);
      }
      res.json({ success: true, selecionado: val === 1 });
    } catch (err) {
      console.error('[Liquidação API] Erro em /selecionar-todos:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 5.03 GET /api/liquidacao/pesquisar-estoque (e alias /buscar-produto)
  // Pesquisa qualquer produto livremente no estoque/catálogo do Digifarma (compras_estoque_cache)
  const handlePesquisarEstoque = async (req, res) => {
    try {
      const q = req.query.q ? String(req.query.q).trim() : '';
      if (!q || q.length < 2) {
        return res.json({ produtos: [] });
      }

      const isNumeric = /^\d+$/.test(q);
      let rows = [];

      if (isNumeric) {
        const num = Number(q);
        rows = db.prepare(`
          SELECT 
            produto_id, descricao, apresentacao, ean, categoria_id,
            saldo, preco_normal, preco_promocional, 
            COALESCE(NULLIF(custo_unitario, 0), NULLIF(ultima_compra_valor, 0), 0) as preco_custo
          FROM compras_estoque_cache
          WHERE produto_id = ? OR ean = ? OR ean LIKE ?
          ORDER BY saldo DESC, descricao ASC
          LIMIT 25
        `).all(num, q, `${q}%`);

        if (rows.length === 0) {
          try {
            const fbRows = await queryDigifarma(
              `SELECT FIRST 1 
                 PRODUTO_ID, PRODUTO as DESCRICAO, APRESENTACAO, COD_BARRAS as EAN, CATEGORIA_ID, 
                 PROD_SALDO as SALDO, PROD_PRVENDA as PRECO_NORMAL, PROD_PRPROMOCAO as PRECO_PROMOCIONAL, 
                 COALESCE(NULLIF(PROD_CMV, 0), NULLIF(PROD_PRCOMPRA, 0), 0) as PRECO_CUSTO 
               FROM PRODUTOS WHERE PRODUTO_ID = ?`,
              [num],
              3000
            );
            if (fbRows && fbRows.length > 0) {
              rows = fbRows.map(r => ({
                produto_id: r.PRODUTO_ID,
                descricao: r.DESCRICAO,
                apresentacao: r.APRESENTACAO,
                ean: r.EAN,
                categoria_id: r.CATEGORIA_ID,
                saldo: r.SALDO,
                preco_normal: r.PRECO_NORMAL,
                preco_promocional: r.PRECO_PROMOCIONAL,
                preco_custo: r.PRECO_CUSTO
              }));
            }
          } catch (e) {}
        }
      } else {
        const words = q.split(/\s+/).filter(w => w.length > 0);
        const whereClauses = words.map(() => `descricao LIKE ?`);
        const params = words.map(w => `%${w}%`);

        rows = db.prepare(`
          SELECT 
            produto_id, descricao, apresentacao, ean, categoria_id,
            saldo, preco_normal, preco_promocional, 
            COALESCE(NULLIF(custo_unitario, 0), NULLIF(ultima_compra_valor, 0), 0) as preco_custo
          FROM compras_estoque_cache
          WHERE ${whereClauses.join(' AND ')}
          ORDER BY saldo DESC, descricao ASC
          LIMIT 25
        `).all(...params);
      }

      const produtos = rows.map(r => {
        const precoNormal = Number(r.preco_normal) || 0;
        const precoPromo = Number(r.preco_promocional) || 0;
        const precoCusto = Number(r.preco_custo) || 0;
        const precoVigente = precoPromo > 0 ? precoPromo : precoNormal;

        return {
          produto_id: r.produto_id,
          descricao: r.descricao,
          apresentacao: r.apresentacao || '',
          ean: r.ean || '',
          categoria: String(r.categoria_id || 'Geral'),
          saldo: Number(r.saldo) || 0,
          preco_tabela: precoNormal,
          preco_promocional_atual: precoPromo,
          preco_normal: precoVigente,
          preco_custo: precoCusto
        };
      });

      res.json({ produtos });
    } catch (err) {
      console.error('[Liquidação API] Erro em /pesquisar-estoque:', err);
      res.status(500).json({ error: err.message });
    }
  };

  router.get('/pesquisar-estoque', handlePesquisarEstoque);
  router.get('/buscar-produto', handlePesquisarEstoque);

  // 5.04 POST /api/liquidacao/incluir-avulso (e alias /inserir-manual)
  // Inclui livremente qualquer produto do estoque na campanha com seleção e blindagem de custo
  const handleIncluirAvulso = async (req, res) => {
    try {
      const { 
        produto_id, 
        preco_promocional, 
        desconto_percentual, 
        data_termino, 
        sincronizar_digifarma 
      } = req.body;

      const pId = Number(produto_id);
      if (!pId || isNaN(pId)) {
        return res.status(400).json({ error: 'produto_id é obrigatório.' });
      }

      const campanha = getOrCreateCampanhaAtiva();

      // 1. Busca dados atualizados no Digifarma Firebird (com fallback no compras_estoque_cache)
      let fbData = null;
      try {
        const fbRows = await queryDigifarma(
          `SELECT FIRST 1 
             PRODUTO_ID, PRODUTO, APRESENTACAO, COD_BARRAS, PROD_SALDO, 
             PROD_PRVENDA, PROD_PRPROMOCAO, INICIO_PROMOCAO, TERMINO_PROMOCAO, 
             PROD_CMV, PROD_PRCOMPRA, VALOR_ULT_COMPRA 
           FROM PRODUTOS WHERE PRODUTO_ID = ?`,
          [pId],
          4000
        );
        if (fbRows && fbRows.length > 0) {
          fbData = fbRows[0];
        }
      } catch (e) {
        console.warn(`[Liquidação API] Firebird indisponível para produto avulso ${pId}, usando SQLite:`, e.message);
      }

      const cacheProd = db.prepare(`
        SELECT produto_id, descricao, apresentacao, ean as cod_barras, categoria_id, saldo, preco_normal, custo_unitario, ultima_compra_valor
        FROM compras_estoque_cache
        WHERE produto_id = ?
      `).get(pId) || {};

      const descricao = (fbData && fbData.PRODUTO) || cacheProd.descricao || `Produto #${pId}`;
      const apresentacao = (fbData && fbData.APRESENTACAO) || cacheProd.apresentacao || '';
      const codBarras = (fbData && fbData.COD_BARRAS) || cacheProd.cod_barras || '';
      const saldo = fbData ? Number(fbData.PROD_SALDO || 0) : Number(cacheProd.saldo || 0);

      const prVendaTabela = fbData ? Number(fbData.PROD_PRVENDA || 0) : Number(cacheProd.preco_normal || 0);
      const prPromoAtual = fbData ? Number(fbData.PROD_PRPROMOCAO || 0) : 0;
      const inicioPromoOriginal = fbData ? fbData.INICIO_PROMOCAO : null;
      const terminoPromoOriginal = fbData ? fbData.TERMINO_PROMOCAO : null;

      // Preço de venda vigente
      const precoNormalRef = prPromoAtual > 0 ? prPromoAtual : prVendaTabela;

      // Custo Real Unitário
      let precoCusto = 0;
      if (fbData && Number(fbData.PROD_CMV) > 0) {
        precoCusto = Number(fbData.PROD_CMV);
      } else if (fbData && Number(fbData.VALOR_ULT_COMPRA) > 0) {
        precoCusto = Number(fbData.VALOR_ULT_COMPRA);
      } else if (cacheProd.custo_unitario && Number(cacheProd.custo_unitario) > 0) {
        precoCusto = Number(cacheProd.custo_unitario);
      } else if (cacheProd.ultima_compra_valor && Number(cacheProd.ultima_compra_valor) > 0) {
        precoCusto = Number(cacheProd.ultima_compra_valor);
      }

      if (precoCusto <= 0 || (precoNormalRef > 0 && precoCusto >= precoNormalRef)) {
        if (fbData && Number(fbData.PROD_CMV) > 0 && Number(fbData.PROD_CMV) < precoNormalRef) {
          precoCusto = Number(fbData.PROD_CMV);
        } else {
          precoCusto = Number((precoNormalRef * 0.60).toFixed(2));
        }
      }
      precoCusto = Number(precoCusto.toFixed(2));

      // Determina o preço promocional
      let prPromo = parseFloat(preco_promocional);
      if (isNaN(prPromo) || prPromo <= 0) {
        const descPct = parseFloat(desconto_percentual) || 30;
        prPromo = Math.round(precoNormalRef * (1 - descPct / 100) * 100) / 100;
        // REGRA DE BLINDAGEM: Sugestões automáticas nunca ficam abaixo do custo
        const pisoCusto = precoCusto > 0 ? precoCusto : 0.10;
        if (prPromo < pisoCusto) {
          prPromo = pisoCusto;
        }
      }
      prPromo = roundUpToAcceptedCents(prPromo);

      const descPctReal = precoNormalRef > 0 
        ? Math.max(0, Math.round(((precoNormalRef - prPromo) / precoNormalRef) * 100)) 
        : 0;

      const dtInicio = req.body.data_inicio || campanha.data_inicio || '2026-10-05';
      const dtFim = data_termino || campanha.data_fim || '2026-10-31';

      // Sincroniza com o Digifarma se solicitado (padrão true se não especificado)
      let fbOk = false;
      if (sincronizar_digifarma !== false) {
        const fbInicio = formatarDataFirebird(dtInicio, false);
        const fbTermino = formatarDataFirebird(dtFim, true);
        try {
          await queryDigifarma(
            `UPDATE PRODUTOS 
             SET PROD_PRPROMOCAO = ?, 
                 INICIO_PROMOCAO = ?, 
                 TERMINO_PROMOCAO = ? 
             WHERE PRODUTO_ID = ?`,
            [prPromo, fbInicio, fbTermino, pId]
          );
          fbOk = true;
          console.log(`[Liquidação API] ✅ Produto avulso ${pId} gravado no Digifarma Firebird: R$ ${prPromo} (${fbInicio} até ${fbTermino})`);
        } catch (fbErr) {
          console.warn(`[Liquidação API] Falha Firebird produto avulso ${pId}:`, fbErr.message);
        }
      }

      // 3. Insere ou atualiza na tabela de liquidação
      const existing = db.prepare(`
        SELECT id FROM liquidacao_campanhas_itens 
        WHERE campanha_id = ? AND produto_id = ? AND status = 'ativo'
      `).get(campanha.id, pId);

      const itemId = existing ? existing.id : ('liq_' + pId + '_' + Date.now());

      if (existing) {
        db.prepare(`
          UPDATE liquidacao_campanhas_itens 
          SET preco_promocional = ?,
              desconto_percentual = ?,
              preco_custo = ?,
              preco_normal = ?,
              saldo_estoque = ?,
              data_inicio = ?,
              data_termino = ?,
              sincronizado_digifarma = ?,
              preco_venda_original = COALESCE(NULLIF(preco_venda_original, 0), ?),
              preco_promocao_original = COALESCE(NULLIF(preco_promocao_original, 0), ?),
              inicio_promocao_original = COALESCE(inicio_promocao_original, ?),
              termino_promocao_original = COALESCE(termino_promocao_original, ?),
              selecionado = 1
          WHERE id = ?
        `).run(
          prPromo, descPctReal, precoCusto, precoNormalRef, saldo,
          dtInicio, dtFim, fbOk ? 1 : 0,
          prVendaTabela, prPromoAtual, inicioPromoOriginal, terminoPromoOriginal,
          itemId
        );
      } else {
        db.prepare(`
          INSERT INTO liquidacao_campanhas_itens (
            id, campanha_id, produto_id, descricao, apresentacao, ean, categoria,
            saldo_estoque, preco_custo, preco_normal, preco_promocional, desconto_percentual,
            data_inicio, data_termino, status, sincronizado_digifarma, aprovado_por,
            preco_venda_original, preco_promocao_original, inicio_promocao_original, termino_promocao_original,
            dias_parado, selecionado
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, 'ativo', ?, 'Manual (Avulso)',
            ?, ?, ?, ?,
            0, 1
          )
        `).run(
          itemId, campanha.id, pId, descricao, apresentacao, codBarras, String(cacheProd.categoria_id || 'Geral'),
          saldo, precoCusto, precoNormalRef, prPromo, descPctReal,
          dtInicio, dtFim, fbOk ? 1 : 0,
          prVendaTabela, prPromoAtual, inicioPromoOriginal, terminoPromoOriginal
        );
      }

      // Atualiza caches locais
      try {
        db.prepare('UPDATE compras_estoque_cache SET preco_promocional = ?, inicio_promocao = ?, termino_promocao = ? WHERE produto_id = ?')
          .run(prPromo, dtInicio, dtFim, pId);
      } catch (e) {}

      const itemRetorno = {
        id: itemId,
        campanha_id: campanha.id,
        produto_id: pId,
        descricao,
        apresentacao,
        ean: codBarras,
        cod_barras: codBarras,
        categoria: String(cacheProd.categoria_id || 'Geral'),
        saldo_estoque: saldo,
        preco_custo: precoCusto,
        preco_normal: precoNormalRef,
        preco_promocional: prPromo,
        desconto_percentual: descPctReal,
        data_inicio: dtInicio,
        data_termino: dtFim,
        status: 'ativo',
        sincronizado_digifarma: fbOk ? 1 : 0,
        dias_parado: 0,
        sugestao_desconto: 30,
        motivo_sugestao: 'Produto avulso incluído livremente do estoque.',
        selecionado: true
      };

      const isUpdate = !!existing;
      res.json({
        success: true,
        isUpdate,
        message: isUpdate 
          ? `Produto "${descricao}" já estava na liquidação e teve seu preço atualizado para R$ ${prPromo.toFixed(2)} (${descPctReal}% OFF)!`
          : `Produto "${descricao}" incluído na liquidação por R$ ${prPromo.toFixed(2)} (${descPctReal}% OFF)!`,
        item: itemRetorno,
        sincronizado_digifarma: fbOk
      });
    } catch (err) {
      console.error('[Liquidação API] Erro em /incluir-avulso:', err);
      res.status(500).json({ error: err.message });
    }
  };

  router.post('/incluir-avulso', handleIncluirAvulso);
  router.post('/inserir-manual', handleIncluirAvulso);

  // 5.05 POST /api/liquidacao/vendas-manuais
  // Registra uma venda de produto não cadastrado para ser contabilizada diretamente na meta da liquidação
  router.post('/vendas-manuais', async (req, res) => {
    try {
      const { descricao, valor_total, quantidade, data_venda, observacao, registrado_por } = req.body;

      if (!descricao || !descricao.trim()) {
        return res.status(400).json({ error: 'Descrição do produto ou venda é obrigatória.' });
      }

      const valor = parseFloat(valor_total);
      if (isNaN(valor) || valor <= 0) {
        return res.status(400).json({ error: 'Informe um valor total de venda válido maior que zero.' });
      }

      const qtd = parseInt(quantidade) || 1;
      const campanha = getOrCreateCampanhaAtiva();
      const id = 'vm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      const dataVendaStr = data_venda || new Date().toISOString();
      const criadoEm = new Date().toISOString();

      db.prepare(`
        INSERT INTO liquidacao_vendas_manuais (
          id, campanha_id, descricao, valor_total, quantidade, data_venda, observacao, registrado_por, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        campanha.id,
        descricao.trim(),
        valor,
        qtd,
        dataVendaStr,
        observacao ? observacao.trim() : null,
        registrado_por ? registrado_por.trim() : 'Operador',
        criadoEm
      );

      // Invalida cache para recálculo imediato
      vendasCache.timestamp = 0;

      // Recalcula totais da campanha
      const resultadoVendas = await obterVendasCampanha(campanha, true);

      res.status(201).json({
        success: true,
        message: `Venda manual de "${descricao.trim()}" (R$ ${valor.toFixed(2)}) registrada com sucesso e somada à meta!`,
        venda: {
          id,
          campanha_id: campanha.id,
          descricao: descricao.trim(),
          valor_total: valor,
          quantidade: qtd,
          data_venda: dataVendaStr,
          observacao: observacao || '',
          registrado_por: registrado_por || 'Operador'
        },
        campanha: {
          totalResgatado: resultadoVendas.totalResgatado,
          totalItensVendidos: resultadoVendas.totalItensVendidos,
          totalVendasQtd: resultadoVendas.totalVendasQtd
        }
      });
    } catch (err) {
      console.error('[Liquidação API] Erro em POST /vendas-manuais:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 5.06 DELETE /api/liquidacao/vendas-manuais/:id
  // Remove um registro de venda manual e recalcula a meta
  router.delete('/vendas-manuais/:id', async (req, res) => {
    try {
      const vmId = req.params.id;
      const vm = db.prepare('SELECT * FROM liquidacao_vendas_manuais WHERE id = ?').get(vmId);
      if (!vm) {
        return res.status(404).json({ error: 'Registro de venda manual não encontrado.' });
      }

      db.prepare('DELETE FROM liquidacao_vendas_manuais WHERE id = ?').run(vmId);

      vendasCache.timestamp = 0;
      const campanha = getOrCreateCampanhaAtiva();
      const resultadoVendas = await obterVendasCampanha(campanha, true);

      res.json({
        success: true,
        message: `Venda manual "${vm.descricao}" removida da meta.`,
        campanha: {
          totalResgatado: resultadoVendas.totalResgatado,
          totalItensVendidos: resultadoVendas.totalItensVendidos,
          totalVendasQtd: resultadoVendas.totalVendasQtd
        }
      });
    } catch (err) {
      console.error('[Liquidação API] Erro em DELETE /vendas-manuais:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 5.1 POST /api/liquidacao/gravar-lote
  // Grava em lote as ofertas avaliadas pela Nayane diretamente no Digifarma Firebird
  router.post('/gravar-lote', async (req, res) => {
    try {
      const { itens } = req.body;
      if (!Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ error: 'Nenhum item fornecido para gravação em lote.' });
      }

      let sucessos = 0;
      let falhas = 0;
      const hoje = new Date().toISOString().split('T')[0];

      for (const it of itens) {
        const pId = Number(it.produto_id);
        const custo = Number(it.preco_custo) || 0;
        let prPromo = parseFloat(it.preco_promocional);
        const dtFim = it.data_termino || getUltimoDiaDesteMes();

        if (!pId || isNaN(prPromo) || prPromo <= 0) continue;

        // REGRA DE BLINDAGEM: Não gravar valor abaixo do custo
        if (custo > 0 && prPromo < custo) {
          prPromo = custo;
        }

        let fbOk = false;
        const fbTermino = formatarDataFirebird(dtFim, true);
        const fbInicio = formatarDataFirebird(it.data_inicio || hoje, false);

        try {
          await queryDigifarma(
            `UPDATE PRODUTOS 
             SET PROD_PRPROMOCAO = ?, 
                 INICIO_PROMOCAO = ?, 
                 TERMINO_PROMOCAO = ? 
             WHERE PRODUTO_ID = ?`,
            [prPromo, fbInicio, fbTermino, pId]
          );
          fbOk = true;
          sucessos++;
        } catch (e) {
          console.warn(`[Liquidação Lote] Falha Firebird produto ${pId}:`, e.message);
          falhas++;
        }

        // Atualiza no SQLite
        const descPct = it.preco_normal > 0 ? Math.max(0, Math.round(((it.preco_normal - prPromo) / it.preco_normal) * 100)) : 0;
        try {
          db.prepare(`
            UPDATE liquidacao_campanhas_itens 
            SET preco_promocional = ?, 
                desconto_percentual = ?, 
                data_termino = ?, 
                sincronizado_digifarma = ? 
            WHERE id = ? OR (produto_id = ? AND status = 'ativo')
          `).run(prPromo, descPct, dtFim, fbOk ? 1 : 0, it.id || '', pId);
        } catch (e) {}

        try {
          db.prepare('UPDATE compras_estoque_cache SET preco_promocional = ?, termino_promocao = ? WHERE produto_id = ?')
            .run(prPromo, dtFim, pId);
        } catch (e) {}
      }

      res.json({
        success: true,
        message: `${sucessos} ofertas gravadas com sucesso no Digifarma Firebird!` + (falhas > 0 ? ` (${falhas} falhas)` : ''),
        sucessos,
        falhas
      });
    } catch (err) {
      console.error('[Liquidação API] Erro em /gravar-lote:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 5.2 POST /api/liquidacao/reset-digifarma
  // Reseta todos os preços no Firebird de volta para os preços originais pré-liquidação
  router.post('/reset-digifarma', security.requireAdmin, async (req, res) => {
    try {
      const itens = db.prepare(`
        SELECT produto_id, preco_promocao_original, inicio_promocao_original, termino_promocao_original 
        FROM liquidacao_campanhas_itens 
        WHERE status = 'ativo'
      `).all();
      
      let sucessos = 0;
      for (const it of itens) {
        try {
          const promoOrig = Number(it.preco_promocao_original) || 0;
          const dtIni = it.inicio_promocao_original ? formatarDataFirebird(it.inicio_promocao_original, false) : null;
          const dtFim = it.termino_promocao_original ? formatarDataFirebird(it.termino_promocao_original, true) : null;

          await queryDigifarma(
            "UPDATE PRODUTOS SET PROD_PRPROMOCAO = ?, INICIO_PROMOCAO = ?, TERMINO_PROMOCAO = ? WHERE PRODUTO_ID = ?",
            [promoOrig, dtIni, dtFim, Number(it.produto_id)]
          );
          sucessos++;
        } catch (e) {}
      }

      db.prepare("UPDATE liquidacao_campanhas_itens SET sincronizado_digifarma = 0 WHERE status = 'ativo'").run();

      res.json({
        success: true,
        message: `Digifarma restaurado com precisão para os preços originais pré-liquidação (${sucessos} itens). Lista mantida para revisão da Nayane!`,
        total: sucessos
      });
    } catch (err) {
      console.error('[Liquidação API] Erro em /reset-digifarma:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 6. POST /api/liquidacao/reverter
  // Reverte a promoção de um produto no Digifarma para seu preço original pré-liquidação
  router.post('/reverter', async (req, res) => {
    try {
      const { produto_id, itemId } = req.body;
      const pId = Number(produto_id);

      const itemCadastrado = (itemId 
        ? db.prepare("SELECT * FROM liquidacao_campanhas_itens WHERE id = ?").get(itemId)
        : null) || db.prepare("SELECT * FROM liquidacao_campanhas_itens WHERE produto_id = ? AND status = 'ativo'").get(pId);

      const promoOrig = itemCadastrado && itemCadastrado.preco_promocao_original != null ? Number(itemCadastrado.preco_promocao_original) : 0;
      const dtIni = itemCadastrado && itemCadastrado.inicio_promocao_original ? formatarDataFirebird(itemCadastrado.inicio_promocao_original, false) : null;
      const dtFim = itemCadastrado && itemCadastrado.termino_promocao_original ? formatarDataFirebird(itemCadastrado.termino_promocao_original, true) : null;

      // Reverte no Firebird para o valor original
      let fbOk = false;
      try {
        await queryDigifarma(
          `UPDATE PRODUTOS 
           SET PROD_PRPROMOCAO = ?, 
               INICIO_PROMOCAO = ?, 
               TERMINO_PROMOCAO = ? 
           WHERE PRODUTO_ID = ?`,
          [promoOrig, dtIni, dtFim, pId]
        );
        fbOk = true;
      } catch (fbErr) {
        console.warn(`[Liquidação API] Reversão Firebird falhou: ${fbErr.message}`);
      }

      // Atualiza status no SQLite
      if (itemId) {
        db.prepare("UPDATE liquidacao_campanhas_itens SET status = 'revertido' WHERE id = ?").run(itemId);
      } else {
        db.prepare("UPDATE liquidacao_campanhas_itens SET status = 'revertido' WHERE produto_id = ? AND status = 'ativo'").run(pId);
      }

      // Restaura no cache de compras
      try {
        db.prepare("UPDATE compras_estoque_cache SET preco_promocional = ? WHERE produto_id = ?").run(promoOrig, pId);
      } catch (e) {}

      res.json({ success: true, message: 'Produto revertido para o preço original pré-liquidação no Digifarma!', firebirdSincronizado: fbOk });
    } catch (err) {
      console.error('[Liquidação API] Erro em /reverter:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 6.01 POST /api/liquidacao/remover-item
  // Remove o produto da liquidação (status = 'removido') e restaura o preço original pré-liquidação no Digifarma
  router.post('/remover-item', async (req, res) => {
    try {
      const { produto_id, itemId } = req.body;
      const pId = Number(produto_id);

      const itemCadastrado = (itemId 
        ? db.prepare("SELECT * FROM liquidacao_campanhas_itens WHERE id = ?").get(itemId)
        : null) || db.prepare("SELECT * FROM liquidacao_campanhas_itens WHERE produto_id = ? AND status = 'ativo'").get(pId);

      if (itemCadastrado) {
        const promoOrig = itemCadastrado.preco_promocao_original != null ? Number(itemCadastrado.preco_promocao_original) : 0;
        const dtIni = itemCadastrado.inicio_promocao_original ? formatarDataFirebird(itemCadastrado.inicio_promocao_original, false) : null;
        const dtFim = itemCadastrado.termino_promocao_original ? formatarDataFirebird(itemCadastrado.termino_promocao_original, true) : null;

        // Se o produto estava gravado/sincronizado no Digifarma, restaura preço e vigência originais
        if (itemCadastrado.sincronizado_digifarma) {
          try {
            await queryDigifarma(
              `UPDATE PRODUTOS 
               SET PROD_PRPROMOCAO = ?, 
                   INICIO_PROMOCAO = ?, 
                   TERMINO_PROMOCAO = ? 
               WHERE PRODUTO_ID = ?`,
              [promoOrig, dtIni, dtFim, pId]
            );
          } catch (fbErr) {
            console.warn(`[Liquidação API] Remoção: Reversão Firebird falhou (${fbErr.message})`);
          }
        }

        // Marca status como 'removido'
        db.prepare("UPDATE liquidacao_campanhas_itens SET status = 'removido', selecionado = 0 WHERE id = ?").run(itemCadastrado.id);

        // Restaura no cache de compras
        try {
          db.prepare("UPDATE compras_estoque_cache SET preco_promocional = ? WHERE produto_id = ?").run(promoOrig, pId);
        } catch (e) {}
      } else if (pId) {
        db.prepare("UPDATE liquidacao_campanhas_itens SET status = 'removido', selecionado = 0 WHERE produto_id = ? AND status = 'ativo'").run(pId);
      }

      res.json({ success: true, message: 'Produto removido da liquidação e preço original restaurado no Digifarma!' });
    } catch (err) {
      console.error('[Liquidação API] Erro em /remover-item:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 6.05 POST /api/liquidacao/verificar-restaurar-expirados
  // Varre todas as ofertas cuja data_termino já expirou (< hoje) e restaura automaticamente
  // o preço original (tanto PROD_PRPROMOCAO original quanto datas) no Digifarma e no SQLite!
  router.post('/verificar-restaurar-expirados', async (req, res) => {
    try {
      const hoje = new Date().toISOString().split('T')[0];
      const expirados = db.prepare(`
        SELECT * FROM liquidacao_campanhas_itens 
        WHERE status = 'ativo' AND data_termino IS NOT NULL AND data_termino < ?
      `).all(hoje);

      console.log(`[Liquidação API] 🔍 Checando promoções expiradas (< ${hoje}). Encontradas: ${expirados.length}`);

      const restaurados = [];
      for (const item of expirados) {
        const pId = Number(item.produto_id);
        const promoOrig = Number(item.preco_promocao_original) || 0;
        const vendaOrig = Number(item.preco_venda_original) || Number(item.preco_normal) || 0;
        const dtIniOrig = item.inicio_promocao_original ? formatarDataFirebird(item.inicio_promocao_original, false) : null;
        const dtFimOrig = item.termino_promocao_original ? formatarDataFirebird(item.termino_promocao_original, true) : null;

        let fbOk = false;
        try {
          await queryDigifarma(
            `UPDATE PRODUTOS 
             SET PROD_PRPROMOCAO = ?, 
                 INICIO_PROMOCAO = ?, 
                 TERMINO_PROMOCAO = ? 
             WHERE PRODUTO_ID = ?`,
            [promoOrig, dtIniOrig, dtFimOrig, pId]
          );
          fbOk = true;
        } catch (fbErr) {
          console.warn(`[Liquidação API] Falha ao reverter Firebird item expirado ${pId}:`, fbErr.message);
        }

        db.prepare(`
          UPDATE liquidacao_campanhas_itens 
          SET status = 'expirado_restaurado',
              sincronizado_digifarma = 0
          WHERE id = ?
        `).run(item.id);

        try {
          db.prepare(`
            UPDATE compras_estoque_cache 
            SET preco_promocional = ?,
                preco_venda_vigente = ?
            WHERE produto_id = ?
          `).run(promoOrig, promoOrig > 0 ? promoOrig : vendaOrig, pId);
        } catch (e) {}

        restaurados.push({
          produto_id: pId,
          descricao: item.descricao,
          data_termino: item.data_termino,
          restaurado_para: promoOrig > 0 ? `R$ ${promoOrig.toFixed(2)} (Promoção Prévia)` : `R$ ${vendaOrig.toFixed(2)} (Preço Tabela)`,
          firebirdOk: fbOk
        });
      }

      res.json({
        success: true,
        message: `${restaurados.length} promoções expiradas verificadas e restauradas com sucesso para o preço antigo!`,
        total_expirados: expirados.length,
        restaurados
      });
    } catch (err) {
      console.error('[Liquidação API] Erro em /verificar-restaurar-expirados:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 6.1 POST /api/liquidacao/atualizar-item
  // Atualiza preço promocional e data de término de uma oferta ativa diretamente da lista
  router.post('/atualizar-item', async (req, res) => {
    try {
      const { id, produto_id, preco_promocional, data_termino } = req.body;
      const pId = Number(produto_id);
      const prPromo = parseFloat(preco_promocional);

      if (!pId || isNaN(prPromo) || prPromo <= 0 || !data_termino) {
        return res.status(400).json({ error: 'Parâmetros inválidos (produto_id, preco_promocional e data_termino são obrigatórios).' });
      }

      // Busca item atual no SQLite
      const itemAtual = (id 
        ? db.prepare("SELECT * FROM liquidacao_campanhas_itens WHERE id = ?").get(id)
        : null) || db.prepare("SELECT * FROM liquidacao_campanhas_itens WHERE produto_id = ? AND status = 'ativo'").get(pId);

      const precoCusto = itemAtual ? Number(itemAtual.preco_custo) : 0;
      if (precoCusto > 0 && prPromo < precoCusto) {
        return res.status(400).json({ 
          error: `Bloqueado: O preço promocional (R$ ${prPromo.toFixed(2).replace('.', ',')}) não pode ficar abaixo do preço de custo (R$ ${precoCusto.toFixed(2).replace('.', ',')}).` 
        });
      }

      const precoNormal = itemAtual ? Number(itemAtual.preco_normal) : prPromo;
      const descPct = precoNormal > 0 ? Math.max(0, Math.round(((precoNormal - prPromo) / precoNormal) * 100)) : 0;

      // 1. Atualiza no Digifarma Firebird
      let fbOk = false;
      const fbTermino = formatarDataFirebird(data_termino, true);
      try {
        await queryDigifarma(
          `UPDATE PRODUTOS 
           SET PROD_PRPROMOCAO = ?, 
               TERMINO_PROMOCAO = ? 
           WHERE PRODUTO_ID = ?`,
          [prPromo, fbTermino, pId]
        );
        fbOk = true;
        console.log(`[Liquidação API] ✅ Oferta atualizada no Digifarma Firebird para produto ${pId}: R$ ${prPromo} até ${fbTermino}`);
      } catch (fbErr) {
        console.warn(`[Liquidação API] ⚠️ Aviso: Falha ao atualizar Firebird (${fbErr.message}). Alteração gravada no cache SQLite local.`);
      }

      // 2. Atualiza na tabela liquidacao_campanhas_itens
      if (itemAtual && itemAtual.id) {
        db.prepare(`
          UPDATE liquidacao_campanhas_itens 
          SET preco_promocional = ?, 
              desconto_percentual = ?, 
              data_termino = ?, 
              sincronizado_digifarma = ? 
          WHERE id = ?
        `).run(prPromo, descPct, data_termino, fbOk ? 1 : 0, itemAtual.id);
      } else {
        db.prepare(`
          UPDATE liquidacao_campanhas_itens 
          SET preco_promocional = ?, 
              desconto_percentual = ?, 
              data_termino = ?, 
              sincronizado_digifarma = ? 
          WHERE produto_id = ? AND status = 'ativo'
        `).run(prPromo, descPct, data_termino, fbOk ? 1 : 0, pId);
      }

      // 3. Atualiza caches SQLite locais
      try {
        db.prepare(`
          UPDATE compras_estoque_cache 
          SET preco_promocional = ?, termino_promocao = ?
          WHERE produto_id = ?
        `).run(prPromo, data_termino, pId);
      } catch (e) {}

      try {
        db.prepare(`
          UPDATE digifarma_products_cache 
          SET preco_promocao = ?, termino_promocao = ?
          WHERE produto_id = ?
        `).run(prPromo, data_termino, pId);
      } catch (e) {}

      res.json({
        success: true,
        message: 'Oferta atualizada com sucesso no Digifarma!',
        firebirdSincronizado: fbOk,
        preco_promocional: prPromo,
        desconto_percentual: descPct,
        data_termino
      });
    } catch (err) {
      console.error('[Liquidação API] Erro em /atualizar-item:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 7. GET /api/liquidacao/texto-whatsapp
  // Gera texto formatado para lista de transmissão ou grupos de ofertas
  router.get('/texto-whatsapp', (req, res) => {
    try {
      const campanha = getOrCreateCampanhaAtiva();
      const itens = db.prepare(`
        SELECT descricao, apresentacao, preco_normal, preco_promocional, data_termino
        FROM liquidacao_campanhas_itens
        WHERE campanha_id = ? AND status = 'ativo'
        ORDER BY preco_promocional ASC
      `).all(campanha.id);

      if (itens.length === 0) {
        return res.json({ texto: 'Nenhuma oferta ativa no momento para gerar o texto.' });
      }

      const dataFimStr = itens[0].data_termino ? itens[0].data_termino.split('-').reverse().join('/') : 'este domingo';

      let texto = `🔥 *MEGA QUEIMA DE ESTOQUE - BELAFARMA!* 🔥\n`;
      texto += `Preços de fábrica imperdíveis enquanto durarem os estoques!\n`;
      texto += `📅 *Válido até:* ${dataFimStr}\n\n`;

      itens.forEach((it, idx) => {
        const nome = it.descricao + (it.apresentacao ? ` (${it.apresentacao})` : '');
        texto += `${idx + 1}. *${nome}*\n`;
        texto += `   ~De: R$ ${it.preco_normal.toFixed(2).replace('.', ',')}~\n`;
        texto += `   👉 *POR APENAS: R$ ${it.preco_promocional.toFixed(2).replace('.', ',')}*\n\n`;
      });

      texto += `⚡ *Peça agora mesmo no balcão ou pelo WhatsApp!*\n`;
      texto += `📍 BelaFarma - Cuidando da sua saúde com o melhor preço da região!`;

      res.json({ texto });
    } catch (err) {
      console.error('[Liquidação API] Erro em /texto-whatsapp:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ─── 8. GESTÃO DE IMAGENS DE PRODUTOS PARA ENCARTE & ARTES ───

  async function buscarEBaixarImagemWeb(produto_id, ean, descricao) {
    const pId = Number(produto_id);
    const uploadsDir = path.join(__dirname, 'uploads', 'produtos');
    const publicUploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'produtos');
    
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    if (!fs.existsSync(publicUploadsDir)) fs.mkdirSync(publicUploadsDir, { recursive: true });

    const fileName = `${pId}.jpg`;
    const destPath = path.join(uploadsDir, fileName);
    const destPublic = path.join(publicUploadsDir, fileName);

    // 0. Tenta buscar prioritariamente no catálogo Napp (scraped_images)
    try {
      let nappRow = null;
      if (ean && String(ean).trim().length >= 7) {
        nappRow = db.prepare('SELECT image_url FROM scraped_images WHERE ean = ? AND image_url IS NOT NULL AND image_url != ""').get(String(ean).trim());
      }
      if (!nappRow && descricao) {
        const firstWord = String(descricao).trim().split(' ')[0];
        if (firstWord && firstWord.length >= 3) {
          nappRow = db.prepare('SELECT image_url FROM scraped_images WHERE name LIKE ? AND image_url IS NOT NULL AND image_url != "" LIMIT 1').get(`%${firstWord}%`);
        }
      }
      if (nappRow && nappRow.image_url) {
        const nappRes = await fetch(nappRow.image_url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(4500)
        });
        if (nappRes.ok) {
          const buffer = Buffer.from(await nappRes.arrayBuffer());
          if (buffer.length > 2500) {
            fs.writeFileSync(destPath, buffer);
            try { fs.writeFileSync(destPublic, buffer); } catch(e) {}
            return `/uploads/produtos/${fileName}`;
          }
        }
      }
    } catch (e) {
      console.warn('[buscarEBaixarImagemWeb] Aviso ao consultar Napp:', e.message);
    }

    const queryTerms = [];
    if (ean && String(ean).trim().length >= 7) {
      const cleanEan = String(ean).trim();
      // 1. Tenta baixar direto do CDN Cosmos (alta qualidade e instantâneo)
      try {
        const cosmosUrl = `https://cdn-cosmos.bluesoft.com.br/products/${cleanEan}`;
        const cosmosRes = await fetch(cosmosUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(4000)
        });
        if (cosmosRes.ok) {
          const buffer = Buffer.from(await cosmosRes.arrayBuffer());
          if (buffer.length > 2500) {
            fs.writeFileSync(destPath, buffer);
            try { fs.writeFileSync(destPublic, buffer); } catch(e) {}
            return `/uploads/produtos/${fileName}`;
          }
        }
      } catch (e) {}

      queryTerms.push(`${cleanEan} ${String(descricao).split(' ')[0]}`);
    }
    const cleanDesc = String(descricao || '').replace(/[^\w\s]/gi, ' ').trim();
    queryTerms.push(`${cleanDesc} farmacia medicamento`);

    for (const q of queryTerms) {
      try {
        const tokenUrl = 'https://duckduckgo.com/?q=' + encodeURIComponent(q);
        const r1 = await fetch(tokenUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(4500) });
        const html = await r1.text();
        const vqdMatch = html.match(/vqd=([\d-]+)/);
        if (!vqdMatch) continue;
        const vqd = vqdMatch[1];
        const imgUrl = 'https://duckduckgo.com/i.js?l=wt-wt&o=json&q=' + encodeURIComponent(q) + '&vqd=' + vqd + '&f=,,,';
        const r2 = await fetch(imgUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(4500) });
        const data = await r2.json();
        if (data.results && data.results.length > 0) {
          for (const res of data.results.slice(0, 4)) {
            try {
              const imgRes = await fetch(res.image, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) });
              if (imgRes.ok) {
                const buffer = Buffer.from(await imgRes.arrayBuffer());
                if (buffer.length > 2500) {
                  fs.writeFileSync(destPath, buffer);
                  try { fs.writeFileSync(destPublic, buffer); } catch(e) {}
                  return `/uploads/produtos/${fileName}`;
                }
              }
            } catch(e) {}
          }
        }
      } catch(e) {}
    }
    return null;
  }

  // 8.1 POST /api/liquidacao/salvar-imagem-manual
  router.post('/salvar-imagem-manual', (req, res) => {
    try {
      const { produto_id, imagem_base64 } = req.body;
      if (!produto_id || !imagem_base64) {
        return res.status(400).json({ error: 'produto_id e imagem_base64 são obrigatórios.' });
      }

      const pId = Number(produto_id);
      const uploadsDir = path.join(__dirname, 'uploads', 'produtos');
      const publicUploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'produtos');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      if (!fs.existsSync(publicUploadsDir)) fs.mkdirSync(publicUploadsDir, { recursive: true });

      const isPng = imagem_base64.startsWith('data:image/png');
      const fileName = isPng ? `${pId}.png` : `${pId}.jpg`;
      const destPath = path.join(uploadsDir, fileName);
      const destPublic = path.join(publicUploadsDir, fileName);

      const base64Data = imagem_base64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      fs.writeFileSync(destPath, buffer);
      try { fs.writeFileSync(destPublic, buffer); } catch(e) {}

      const urlRelativa = `/uploads/produtos/${fileName}?v=${Date.now()}`;
      db.prepare('UPDATE liquidacao_campanhas_itens SET imagem_url = ? WHERE produto_id = ?').run(urlRelativa, pId);
      try { db.prepare('UPDATE compras_estoque_cache SET imagem_url = ? WHERE produto_id = ?').run(urlRelativa, pId); } catch(e) {}

      res.json({ success: true, imagem_url: urlRelativa });
    } catch(err) {
      console.error('[Liquidação API] Erro em /salvar-imagem-manual:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 8.1.1 POST /api/liquidacao/salvar-imagem-url (Download a partir de link colado pelo usuário)
  router.post('/salvar-imagem-url', async (req, res) => {
    try {
      const { produto_id, url } = req.body;
      if (!produto_id || !url) {
        return res.status(400).json({ error: 'produto_id e url são obrigatórios.' });
      }
      if (!security.isSafeExternalUrl(String(url))) {
        return res.status(400).json({ error: 'URL externa inválida ou bloqueada por política de segurança (Anti-SSRF).' });
      }

      const pId = Number(produto_id);
      const uploadsDir = path.join(__dirname, 'uploads', 'produtos');
      const publicUploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'produtos');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      if (!fs.existsSync(publicUploadsDir)) fs.mkdirSync(publicUploadsDir, { recursive: true });

      const fileName = `${pId}.jpg`;
      const destPath = path.join(uploadsDir, fileName);
      const destPublic = path.join(publicUploadsDir, fileName);

      const response = await fetch(url.trim(), {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(8000)
      });

      if (!response.ok) {
        return res.status(400).json({ error: `Não foi possível baixar a imagem da URL informada (Status HTTP ${response.status}).` });
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length < 1000) {
        return res.status(400).json({ error: 'A URL informada não retornou uma imagem válida ou o arquivo é muito pequeno.' });
      }

      fs.writeFileSync(destPath, buffer);
      try { fs.writeFileSync(destPublic, buffer); } catch(e) {}

      const urlRelativa = `/uploads/produtos/${fileName}?v=${Date.now()}`;
      db.prepare('UPDATE liquidacao_campanhas_itens SET imagem_url = ? WHERE produto_id = ?').run(urlRelativa, pId);
      try { db.prepare('UPDATE compras_estoque_cache SET imagem_url = ? WHERE produto_id = ?').run(urlRelativa, pId); } catch(e) {}

      res.json({ success: true, imagem_url: urlRelativa });
    } catch (err) {
      console.error('[Liquidação API] Erro em /salvar-imagem-url:', err);
      res.status(500).json({ error: 'Falha ao baixar imagem do link: ' + err.message });
    }
  });

  // 8.1.2 GET /api/liquidacao/pesquisar-fotos-napp (Busca no catálogo Napp / scraped_images)
  router.get('/pesquisar-fotos-napp', (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      if (!q || q.length < 2) {
        return res.json({ produtos: [] });
      }

      const produtos = db.prepare(`
        SELECT ean, name as descricao, image_url, category, brand
        FROM scraped_images
        WHERE (name LIKE ? OR ean LIKE ?) AND image_url IS NOT NULL AND image_url != ''
        LIMIT 20
      `).all(`%${q}%`, `%${q}%`);

      res.json({ produtos });
    } catch (err) {
      console.error('[Liquidação API] Erro em /pesquisar-fotos-napp:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 8.2 POST /api/liquidacao/buscar-imagem-auto
  router.post('/buscar-imagem-auto', async (req, res) => {
    try {
      const { produto_id, ean, descricao } = req.body;
      if (!produto_id) return res.status(400).json({ error: 'produto_id é obrigatório.' });

      const pId = Number(produto_id);
      const url = await buscarEBaixarImagemWeb(pId, ean, descricao);

      if (url) {
        const urlComCacheBuster = `${url}?v=${Date.now()}`;
        db.prepare('UPDATE liquidacao_campanhas_itens SET imagem_url = ? WHERE produto_id = ?').run(urlComCacheBuster, pId);
        try { db.prepare('UPDATE compras_estoque_cache SET imagem_url = ? WHERE produto_id = ?').run(urlComCacheBuster, pId); } catch(e) {}
        return res.json({ success: true, imagem_url: urlComCacheBuster });
      }

      res.status(404).json({ success: false, message: 'Nenhuma imagem encontrada na web para este produto.' });
    } catch(err) {
      console.error('[Liquidação API] Erro em /buscar-imagem-auto:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 8.3 POST /api/liquidacao/buscar-todas-imagens-auto
  router.post('/buscar-todas-imagens-auto', async (req, res) => {
    try {
      const itens = db.prepare(`
        SELECT produto_id, ean, descricao 
        FROM liquidacao_campanhas_itens 
        WHERE status = 'ativo' AND (imagem_url IS NULL OR imagem_url = '')
      `).all();

      let encontrados = 0;
      let erros = 0;

      for (const it of itens) {
        try {
          const url = await buscarEBaixarImagemWeb(it.produto_id, it.ean, it.descricao);
          if (url) {
            const urlBuster = `${url}?v=${Date.now()}`;
            db.prepare('UPDATE liquidacao_campanhas_itens SET imagem_url = ? WHERE produto_id = ?').run(urlBuster, it.produto_id);
            try { db.prepare('UPDATE compras_estoque_cache SET imagem_url = ? WHERE produto_id = ?').run(urlBuster, it.produto_id); } catch(e) {}
            encontrados++;
          }
          await new Promise(r => setTimeout(r, 200));
        } catch(e) {
          erros++;
        }
      }

      res.json({
        success: true,
        total: itens.length,
        encontrados,
        erros
      });
    } catch(err) {
      console.error('[Liquidação API] Erro em /buscar-todas-imagens-auto:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // 9. MONITORAMENTO, LOCALIZAÇÃO, CARRINHOS ABANDONADOS E MÉTRICAS DA VITRINE
  // =========================================================================

  // 9.1 POST /api/liquidacao/public/analytics/track
  // Endpoint público e assíncrono para registrar eventos da vitrine
  router.post('/public/analytics/track', async (req, res) => {
    try {
      const {
        session_id,
        visitor_id,
        event_type,
        produto_id,
        produto_nome,
        produto_preco,
        categoria,
        search_term,
        search_results_count,
        cart_items,
        cart_total,
        client_name,
        client_bairro,
        device_type,
        browser,
        referrer,
        utm_source,
        utm_medium,
        utm_campaign,
        duration_seconds,
        scroll_percent
      } = req.body || {};

      if (!session_id || !visitor_id || !event_type) {
        return res.status(400).json({ error: 'session_id, visitor_id e event_type são obrigatórios.' });
      }

      // Extração de IP e geolocalização silenciosa
      const rawIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
      const geo = await getGeoLocationFromIp(rawIp);

      const now = new Date();
      const createdAt = now.toISOString();
      const dateStr = createdAt.split('T')[0];
      const hourOfDay = now.getHours();

      const devType = device_type || (req.headers['user-agent'] && /mobile|android|iphone|ipad/i.test(req.headers['user-agent']) ? 'mobile' : 'desktop');

      // 1. Atualizar ou registrar o visitante persistente (vitrine_visitors)
      const existingVisitor = db.prepare('SELECT * FROM vitrine_visitors WHERE visitor_id = ?').get(visitor_id);
      if (existingVisitor) {
        const isNewVisitDay = existingVisitor.last_visit_at.split('T')[0] !== dateStr && event_type === 'pageview';
        const newTotalVisits = isNewVisitDay ? (existingVisitor.total_visits + 1) : existingVisitor.total_visits;

        db.prepare(`
          UPDATE vitrine_visitors
          SET last_visit_at = ?,
              total_visits = ?,
              city = COALESCE(?, city),
              state = COALESCE(?, state),
              last_bairro = COALESCE(?, last_bairro),
              client_name = COALESCE(?, client_name),
              device_type = COALESCE(?, device_type)
          WHERE visitor_id = ?
        `).run(
          createdAt,
          newTotalVisits,
          geo.cidade,
          geo.estado,
          client_bairro || null,
          client_name || null,
          devType,
          visitor_id
        );
      } else {
        db.prepare(`
          INSERT INTO vitrine_visitors (
            visitor_id, first_visit_at, last_visit_at, total_visits,
            city, state, last_bairro, client_name, device_type
          ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
        `).run(
          visitor_id,
          createdAt,
          createdAt,
          geo.cidade,
          geo.estado,
          client_bairro || null,
          client_name || null,
          devType
        );
      }

      // 2. Rastreamento e gestão de carrinhos (vitrine_abandoned_carts) unificados pelo ID do Cliente (visitor_id)
      const cartItemsJson = Array.isArray(cart_items) ? JSON.stringify(cart_items) : (typeof cart_items === 'string' ? cart_items : '[]');
      const numericCartTotal = Number(cart_total) || 0;
      const itemsCount = Array.isArray(cart_items) ? cart_items.reduce((acc, item) => acc + (Number(item.quantidade) || 1), 0) : 0;

      if (event_type === 'add_to_cart' || event_type === 'cart_update') {
        if (itemsCount > 0) {
          // Busca nome e bairro salvos previamente no perfil do visitante se não fornecidos no momento
          const visitorRecord = db.prepare('SELECT client_name, last_bairro FROM vitrine_visitors WHERE visitor_id = ?').get(visitor_id);
          const resolvedName = client_name || (visitorRecord ? visitorRecord.client_name : null);
          const resolvedBairro = client_bairro || (visitorRecord ? visitorRecord.last_bairro : null);

          db.prepare(`
            INSERT INTO vitrine_abandoned_carts (
              visitor_id, session_id, cart_items_json, cart_total, items_count,
              client_name, client_bairro, status, city, state, device_type,
              created_at, updated_at, date_str
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'abandoned', ?, ?, ?, ?, ?, ?)
            ON CONFLICT(visitor_id) DO UPDATE SET
              session_id = excluded.session_id,
              cart_items_json = excluded.cart_items_json,
              cart_total = excluded.cart_total,
              items_count = excluded.items_count,
              client_name = COALESCE(excluded.client_name, vitrine_abandoned_carts.client_name),
              client_bairro = COALESCE(excluded.client_bairro, vitrine_abandoned_carts.client_bairro),
              city = COALESCE(excluded.city, vitrine_abandoned_carts.city),
              state = COALESCE(excluded.state, vitrine_abandoned_carts.state),
              device_type = COALESCE(excluded.device_type, vitrine_abandoned_carts.device_type),
              status = 'abandoned',
              updated_at = excluded.updated_at,
              date_str = excluded.date_str
          `).run(
            visitor_id,
            session_id,
            cartItemsJson,
            numericCartTotal,
            itemsCount,
            resolvedName,
            resolvedBairro,
            geo.cidade,
            geo.estado,
            devType,
            createdAt,
            createdAt,
            dateStr
          );
        } else {
          db.prepare(`DELETE FROM vitrine_abandoned_carts WHERE visitor_id = ?`).run(visitor_id);
        }
      } else if (event_type === 'whatsapp_checkout') {
        db.prepare(`
          UPDATE vitrine_abandoned_carts
          SET status = 'converted',
              updated_at = ?,
              client_name = COALESCE(?, client_name),
              client_bairro = COALESCE(?, client_bairro)
          WHERE visitor_id = ?
        `).run(createdAt, client_name || null, client_bairro || null, visitor_id);
      }

      // 3. Registrar o evento em vitrine_analytics_events
      db.prepare(`
        INSERT INTO vitrine_analytics_events (
          session_id, visitor_id, event_type, produto_id, produto_nome,
          produto_preco, categoria, search_term, search_results_count,
          cart_items_json, cart_total, client_name, client_bairro,
          ip_address, cidade, estado, pais, device_type, browser,
          referrer, utm_source, utm_medium, utm_campaign,
          duration_seconds, scroll_percent, created_at, date_str, hour_of_day
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?
        )
      `).run(
        session_id,
        visitor_id,
        event_type,
        produto_id ? Number(produto_id) : null,
        produto_nome || null,
        produto_preco ? Number(produto_preco) : 0,
        categoria || null,
        search_term || null,
        search_results_count !== undefined ? Number(search_results_count) : null,
        cartItemsJson,
        numericCartTotal,
        client_name || null,
        client_bairro || null,
        rawIp,
        geo.cidade,
        geo.estado,
        geo.pais || 'Brasil',
        devType,
        browser || null,
        referrer || null,
        utm_source || null,
        utm_medium || null,
        utm_campaign || null,
        Number(duration_seconds) || 0,
        Number(scroll_percent) || 0,
        createdAt,
        dateStr,
        hourOfDay
      );

      res.json({ success: true });
    } catch(err) {
      console.error('[Analytics API] Erro ao registrar evento:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 9.2 GET /api/liquidacao/analytics/dashboard
  // Retorna métricas completas para a aba de inteligência do Belinha
  router.get('/analytics/dashboard', (req, res) => {
    try {
      const period = req.query.period || '7d';
      const now = new Date();
      let startDateStr = '';

      if (period === 'hoje') {
        startDateStr = now.toISOString().split('T')[0];
      } else if (period === '7d') {
        const d = new Date(now.getTime() - 7 * 86400000);
        startDateStr = d.toISOString().split('T')[0];
      } else if (period === '30d') {
        const d = new Date(now.getTime() - 30 * 86400000);
        startDateStr = d.toISOString().split('T')[0];
      }

      const dateFilterSql = startDateStr ? 'AND date_str >= ?' : '';
      const dateFilterParams = startDateStr ? [startDateStr] : [];

      // 1. KPIs Gerais
      const pageviewsRow = db.prepare(`
        SELECT COUNT(*) as count 
        FROM vitrine_analytics_events 
        WHERE event_type = 'pageview' ${dateFilterSql}
      `).get(...dateFilterParams);
      const totalPageviews = pageviewsRow ? pageviewsRow.count : 0;

      const visitorsRow = db.prepare(`
        SELECT COUNT(DISTINCT visitor_id) as count 
        FROM vitrine_analytics_events 
        WHERE 1=1 ${dateFilterSql}
      `).get(...dateFilterParams);
      const uniqueVisitors = visitorsRow ? visitorsRow.count : 0;

      // Recorrência
      const returningRow = db.prepare(`
        SELECT COUNT(DISTINCT vv.visitor_id) as count
        FROM vitrine_visitors vv
        INNER JOIN vitrine_analytics_events vae ON vv.visitor_id = vae.visitor_id
        WHERE vv.total_visits > 1 ${dateFilterSql.replace(/date_str/g, 'vae.date_str')}
      `).get(...dateFilterParams);
      const returningVisitors = returningRow ? returningRow.count : 0;
      const taxaRecorrencia = uniqueVisitors > 0 ? Math.round((returningVisitors / uniqueVisitors) * 100) : 0;

      // Checkouts e Conversão
      const checkoutsRow = db.prepare(`
        SELECT COUNT(*) as count 
        FROM vitrine_analytics_events 
        WHERE event_type = 'whatsapp_checkout' ${dateFilterSql}
      `).get(...dateFilterParams);
      const totalCheckouts = checkoutsRow ? checkoutsRow.count : 0;
      const taxaConversao = uniqueVisitors > 0 ? Math.round((totalCheckouts / uniqueVisitors) * 1000) / 10 : 0;

      // Carrinhos Abandonados
      const abandonedDateFilter = startDateStr ? 'AND date_str >= ?' : '';
      const abandonedStats = db.prepare(`
        SELECT 
          COUNT(CASE WHEN status = 'abandoned' THEN 1 END) as total_abandoned,
          COUNT(CASE WHEN status = 'converted' THEN 1 END) as total_converted,
          COALESCE(SUM(CASE WHEN status = 'abandoned' THEN cart_total ELSE 0 END), 0) as valor_abandoned
        FROM vitrine_abandoned_carts
        WHERE 1=1 ${abandonedDateFilter}
      `).get(...dateFilterParams);

      const totalAbandoned = abandonedStats ? abandonedStats.total_abandoned : 0;
      const totalConverted = abandonedStats ? abandonedStats.total_converted : 0;
      const valorTotalPerdido = abandonedStats ? abandonedStats.valor_abandoned : 0;
      const totalCarrinhosCriados = totalAbandoned + totalConverted;
      const taxaAbandono = totalCarrinhosCriados > 0 ? Math.round((totalAbandoned / totalCarrinhosCriados) * 100) : 0;

      // Tempo médio e Scroll médio
      const durationRow = db.prepare(`
        SELECT 
          AVG(CASE WHEN duration_seconds > 0 THEN duration_seconds END) as avg_duration,
          AVG(CASE WHEN scroll_percent > 0 THEN scroll_percent END) as avg_scroll
        FROM vitrine_analytics_events
        WHERE event_type = 'heartbeat' ${dateFilterSql}
      `).get(...dateFilterParams);
      const avgDurationSeconds = Math.round(durationRow?.avg_duration || 45);
      const avgScrollPercent = Math.round(durationRow?.avg_scroll || 60);

      // 2. Gráfico Temporal (Linha do tempo diária unificada por cliente)
      const timelineRows = db.prepare(`
        SELECT 
          date_str,
          COUNT(CASE WHEN event_type = 'pageview' THEN 1 END) as visualizacoes,
          COUNT(DISTINCT visitor_id) as visitantes_unicos,
          COUNT(DISTINCT CASE WHEN event_type IN ('add_to_cart', 'cart_update') THEN visitor_id END) as carrinhos,
          COUNT(DISTINCT CASE WHEN event_type = 'whatsapp_checkout' THEN visitor_id END) as pedidos
        FROM vitrine_analytics_events
        WHERE 1=1 ${dateFilterSql}
        GROUP BY date_str
        ORDER BY date_str ASC
      `).all(...dateFilterParams);

      // 3. Distribuição Horária (0h a 23h)
      const hourlyRows = db.prepare(`
        SELECT 
          hour_of_day,
          COUNT(*) as acessos
        FROM vitrine_analytics_events
        WHERE event_type = 'pageview' ${dateFilterSql}
        GROUP BY hour_of_day
        ORDER BY hour_of_day ASC
      `).all(...dateFilterParams);
      const hourlyMap = new Map(hourlyRows.map(r => [r.hour_of_day, r.acessos]));
      const hourlyDistribution = Array.from({ length: 24 }, (_, i) => ({
        hora: `${i}h`,
        acessos: hourlyMap.get(i) || 0
      }));

      // 4. Top Cidades
      const topCidadesRows = db.prepare(`
        SELECT 
          cidade,
          estado,
          COUNT(*) as total
        FROM vitrine_analytics_events
        WHERE event_type = 'pageview' AND cidade IS NOT NULL AND cidade != '' ${dateFilterSql}
        GROUP BY cidade, estado
        ORDER BY total DESC
        LIMIT 6
      `).all(...dateFilterParams);
      const topCidades = topCidadesRows.map(r => ({
        cidade: r.cidade,
        estado: r.estado || 'MG',
        total: r.total,
        percentual: totalPageviews > 0 ? Math.round((r.total / totalPageviews) * 100) : 0
      }));

      // 5. Top Bairros
      const topBairrosRows = db.prepare(`
        SELECT 
          client_bairro as bairro,
          COUNT(*) as total
        FROM vitrine_analytics_events
        WHERE client_bairro IS NOT NULL AND TRIM(client_bairro) != '' ${dateFilterSql}
        GROUP BY client_bairro
        ORDER BY total DESC
        LIMIT 6
      `).all(...dateFilterParams);

      // 6. Dispositivos e Origens
      const devRows = db.prepare(`
        SELECT 
          device_type,
          COUNT(*) as total
        FROM vitrine_analytics_events
        WHERE event_type = 'pageview' ${dateFilterSql}
        GROUP BY device_type
      `).all(...dateFilterParams);
      const dispositivos = { mobile: 0, desktop: 0 };
      devRows.forEach(r => {
        if (r.device_type === 'mobile') dispositivos.mobile = r.total;
        else dispositivos.desktop += r.total;
      });

      const origensRows = db.prepare(`
        SELECT 
          CASE 
            WHEN referrer LIKE '%instagram%' OR utm_source = 'instagram' THEN 'Instagram'
            WHEN referrer LIKE '%whatsapp%' OR utm_source = 'whatsapp' THEN 'WhatsApp'
            WHEN referrer LIKE '%facebook%' OR utm_source = 'facebook' THEN 'Facebook'
            WHEN referrer LIKE '%google%' THEN 'Google'
            ELSE 'Direto / Link'
          END as canal,
          COUNT(*) as total
        FROM vitrine_analytics_events
        WHERE event_type = 'pageview' ${dateFilterSql}
        GROUP BY canal
        ORDER BY total DESC
      `).all(...dateFilterParams);

      // 7. Produtos de Alto Interesse sem Compra
      const topInteresseRows = db.prepare(`
        SELECT 
          produto_id,
          produto_nome,
          categoria,
          produto_preco,
          COUNT(CASE WHEN event_type = 'product_click' THEN 1 END) as cliques,
          COUNT(CASE WHEN event_type = 'add_to_cart' THEN 1 END) as adicionados,
          COUNT(CASE WHEN event_type = 'whatsapp_checkout' THEN 1 END) as comprados
        FROM vitrine_analytics_events
        WHERE produto_id IS NOT NULL ${dateFilterSql}
        GROUP BY produto_id
        HAVING cliques > 0
        ORDER BY cliques DESC
        LIMIT 8
      `).all(...dateFilterParams);

      // 8. Termos Mais Buscados na Barra de Pesquisa
      const termosRows = db.prepare(`
        SELECT 
          search_term,
          COUNT(*) as total_buscas,
          AVG(COALESCE(search_results_count, 0)) as media_resultados
        FROM vitrine_analytics_events
        WHERE event_type = 'search' AND search_term IS NOT NULL AND TRIM(search_term) != '' ${dateFilterSql}
        GROUP BY search_term
        ORDER BY total_buscas DESC
        LIMIT 10
      `).all(...dateFilterParams);

      // 9. Alerta de Demanda Reprimida (Itens esgotados clicados/buscados)
      const demandaReprimidaRows = db.prepare(`
        SELECT 
          vae.produto_id,
          vae.produto_nome,
          COUNT(*) as tentativas_clique
        FROM vitrine_analytics_events vae
        LEFT JOIN liquidacao_campanhas_itens lci ON vae.produto_id = lci.produto_id
        LEFT JOIN compras_estoque_cache cec ON vae.produto_id = cec.produto_id
        WHERE vae.event_type IN ('product_click', 'add_to_cart')
          AND COALESCE(cec.saldo, lci.saldo_estoque, 0) <= 0
          AND vae.produto_id IS NOT NULL ${dateFilterSql.replace(/date_str/g, 'vae.date_str')}
        GROUP BY vae.produto_id
        ORDER BY tentativas_clique DESC
        LIMIT 5
      `).all(...dateFilterParams);

      // 10. Carrinhos Abandonados Recentes (Unificados pelo ID do Cliente)
      const carrinhosRecentesRows = db.prepare(`
        SELECT 
          visitor_id,
          session_id,
          cart_items_json,
          cart_total,
          items_count,
          client_name,
          client_bairro,
          city,
          state,
          device_type,
          created_at,
          updated_at
        FROM vitrine_abandoned_carts
        WHERE status = 'abandoned' ${abandonedDateFilter}
        ORDER BY updated_at DESC
        LIMIT 10
      `).all(...dateFilterParams);

      const carrinhosAbandonadosRecentes = carrinhosRecentesRows.map(r => {
        let items = [];
        try { items = JSON.parse(r.cart_items_json); } catch(e) {}
        return {
          id: r.visitor_id,
          visitorId: r.visitor_id,
          sessionId: r.session_id,
          cliente: r.client_name || 'Cliente Anônimo',
          bairro: r.client_bairro || 'Não informado',
          cidade: r.city || 'Juiz de Fora',
          estado: r.state || 'MG',
          dispositivo: r.device_type,
          valor: r.cart_total,
          itensCount: r.items_count,
          dataHora: r.updated_at,
          produtos: items
        };
      });

      res.json({
        success: true,
        period,
        kpis: {
          totalPageviews,
          uniqueVisitors,
          returningVisitors,
          taxaRecorrencia,
          totalCheckouts,
          taxaConversao,
          totalAbandoned,
          valorTotalPerdido,
          taxaAbandono,
          avgDurationSeconds,
          avgScrollPercent
        },
        timeline: timelineRows,
        hourlyDistribution,
        topCidades,
        topBairros: topBairrosRows,
        dispositivos,
        origens: origensRows,
        topInteresse: topInteresseRows,
        termosBuscados: termosRows,
        demandaReprimida: demandaReprimidaRows,
        carrinhosAbandonados: carrinhosAbandonadosRecentes
      });
    } catch(err) {
      console.error('[Analytics API] Erro ao carregar métricas:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 9.3 POST /api/liquidacao/analytics/reset
  // Permite limpar dados de testes
  router.post('/analytics/reset', (req, res) => {
    try {
      db.prepare('DELETE FROM vitrine_analytics_events').run();
      db.prepare('DELETE FROM vitrine_abandoned_carts').run();
      db.prepare('DELETE FROM vitrine_visitors').run();
      res.json({ success: true, message: 'Métricas da vitrine zeradas com sucesso.' });
    } catch(err) {
      console.error('[Analytics API] Erro ao resetar métricas:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
