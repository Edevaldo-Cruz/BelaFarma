/**
 * backend/belaped-endpoints.js
 * Endpoints dedicados para o BelaPed - Central de Cotação, Otimização de Carrinho e Gestão Orçamentária
 * 
 * Regras de Negócio:
 * 1. Regime "Vendeu, comprou de novo" com meta de cobertura de 1 semana (7 a 10 dias) para Curva A e B.
 * 2. REGRA MASTER: Não estourar o orçamento do mês. Se o mês estiver estourado, projeta boletos para o mês com saldo.
 * 3. Otimização de Carrinho: Menor preço líquido com validação de Pedido Mínimo e reagrupamento inteligente.
 * 4. Proteção Fiscal: Identificação e alerta de distribuidoras fora de MG (ICMS / DIFAL).
 * 5. Preparação para automação RPA em modo híbrido.
 */

const express = require('express');
const crypto = require('crypto');
const medicamentosBuscaService = require('./services/medicamentos-busca.service');
const comprasEstoqueService = require('./services/compras-estoque.service');
const comprasEquivalentesService = require('./services/compras-equivalentes.service');
const fs = require('fs');
const path = require('path');
const { ProfarmaRobot } = require('./belaped-robot-profarma');
const { DpcRobot } = require('./belaped-robot-dpc');
const { SotonRobot } = require('./belaped-robot-soton');
const { DistrimedRobot } = require('./belaped-robot-distrimed');
const { DivimedRobot } = require('./belaped-robot-divimed');
const { MartinsRobot } = require('./belaped-robot-martins');

function belapedEndpoints(db) {
  const router = express.Router();

  // Estado global do progresso da cotação ao vivo
  const cotacaoStatus = {
    emAndamento: false,
    fornecedor: 'PROFARMA',
    total: 0,
    atual: 0,
    encontrados: 0,
    ultimoItem: '',
    iniciadoEm: null,
    finalizadoEm: null,
    log: []
  };

  // Controle de sincronização automática da lista de produtos (15 em 15 min c/ ERP Digifarma)
  let syncEstoqueEmAndamento = false;
  let ultimaSyncErpTimestamp = null;

  const sincronizarListaProdutosERP = async (origem = 'auto-15m') => {
    if (syncEstoqueEmAndamento) {
      return { success: true, emAndamento: true, ultimaSync: ultimaSyncErpTimestamp };
    }
    syncEstoqueEmAndamento = true;
    try {
      console.log(`[BelaPed] 🔄 (${origem}) Atualizando lista de produtos, saldos e compras com o ERP Digifarma...`);
      const resSync = await comprasEstoqueService.recalcularTodosEstoqueMinimo(15);
      ultimaSyncErpTimestamp = new Date().toISOString();
      console.log(`[BelaPed] ✅ (${origem}) Lista de produtos atualizada com sucesso em ${ultimaSyncErpTimestamp}`);
      return { success: true, ultimaSync: ultimaSyncErpTimestamp, detalhes: resSync };
    } catch (err) {
      console.error(`[BelaPed] ⚠️ (${origem}) Erro ao atualizar lista de produtos com ERP:`, err.message);
      return { success: false, error: err.message, ultimaSync: ultimaSyncErpTimestamp };
    } finally {
      syncEstoqueEmAndamento = false;
    }
  };

  // Disparo automático a cada 15 minutos (900.000 ms) para refletir correções de saldo, vendas e compras grandes
  const INTERVALO_SYNC_PRODUTOS_MS = 15 * 60 * 1000;
  setInterval(() => {
    sincronizarListaProdutosERP('auto-15m').catch(() => {});
  }, INTERVALO_SYNC_PRODUTOS_MS);

  // Na subida do serviço, verifica se o cache tem mais de 15 min e sincroniza em background
  setTimeout(() => {
    try {
      const row = db.prepare('SELECT MAX(atualizado_em) as ult FROM compras_estoque_cache').get();
      ultimaSyncErpTimestamp = row?.ult || null;
      const idadeMs = row?.ult ? (Date.now() - new Date(row.ult).getTime()) : Infinity;
      if (idadeMs >= INTERVALO_SYNC_PRODUTOS_MS) {
        sincronizarListaProdutosERP('startup-check').catch(() => {});
      }
    } catch (e) {}
  }, 15000);

  // Inicializa tabelas auxiliares do BelaPed no SQLite se não existirem
  const initTables = () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS belaped_portais (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        url_portal TEXT NOT NULL,
        usuario TEXT,
        senha_enc TEXT,
        pedido_minimo REAL DEFAULT 350.00,
        prazo_dias_padrao INTEGER DEFAULT 28,
        uf_origem TEXT DEFAULT 'MG',
        is_mg INTEGER DEFAULT 1,
        is_ativo INTEGER DEFAULT 1,
        observacoes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS belaped_itens_avulsos (
        id TEXT PRIMARY KEY,
        produto_id INTEGER,
        descricao TEXT NOT NULL,
        ean TEXT,
        quantidade REAL NOT NULL,
        preco_referencia REAL,
        motivo TEXT,
        adicionado_por TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS belaped_cotacoes_historico (
        id TEXT PRIMARY KEY,
        distribuidora TEXT NOT NULL,
        produto_id INTEGER NOT NULL,
        ean TEXT,
        descricao TEXT NOT NULL,
        preco_cotado REAL NOT NULL,
        prazo_dias INTEGER DEFAULT 28,
        pedido_minimo REAL DEFAULT 350.00,
        data_cotacao TEXT DEFAULT CURRENT_TIMESTAMP,
        fonte TEXT DEFAULT 'portal'
      );

      CREATE TABLE IF NOT EXISTS belaped_cotacoes_reais (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ean TEXT NOT NULL,
        fornecedor TEXT NOT NULL,
        preco REAL,
        disponivel INTEGER DEFAULT 1,
        descricao TEXT,
        desc_pct REAL,
        updated_at TEXT,
        UNIQUE(ean, fornecedor)
      );

      CREATE TABLE IF NOT EXISTS belaped_precos_historico_diario (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ean TEXT NOT NULL,
        fornecedor TEXT NOT NULL,
        preco REAL NOT NULL,
        descricao TEXT,
        dia_semana INTEGER NOT NULL, -- 0=Domingo, 1=Segunda, ..., 6=Sábado
        dia_mes INTEGER NOT NULL,    -- 1..31
        quinzena INTEGER NOT NULL,   -- 1 (dias 1-15) ou 2 (dias 16-31)
        data_coleta TEXT NOT NULL    -- YYYY-MM-DD
      );
      CREATE INDEX IF NOT EXISTS idx_belaped_hist_ean ON belaped_precos_historico_diario (ean, data_coleta);
      CREATE INDEX IF NOT EXISTS idx_belaped_hist_dia ON belaped_precos_historico_diario (ean, dia_semana);
    `);

    // Cadastra e sincroniza EXCLUSIVAMENTE as 4 distribuidoras reais configuradas
    const portaisReais = [
      { id: 'profarma', nome: 'PROFARMA', url: 'https://pedido.profarma.com.br/?callbackUrl=%2Fnovo-pedido', usuario: '47378578000140', min: 400.0, prazo: 35, uf: 'MG', is_mg: 1, obs: 'Distribuidora Oficial - Importação via planilha CSV e cotação robótica' },
      { id: 'dpc', nome: 'DPC DISTRIBUIDORA', url: 'https://cliente.dpcnet.com.br/?redirect=https%3A%2F%2Fdpcnet.com.br%2F', usuario: '47378578000140', min: 300.0, prazo: 28, uf: 'MG', is_mg: 1, obs: 'Distribuidora Oficial - Importação via planilha CSV e cotação robótica' },
      { id: 'soton', nome: 'SOTON FARMA', url: 'https://sotonfarma.meuspedidos.com.br/entrar', usuario: 'belafarmasul@gmail.com', min: 300.0, prazo: 21, uf: 'MG', is_mg: 1, obs: 'Distribuidora Oficial - Montagem robótica de carrinho produto a produto' },
      { id: 'distrimed', nome: 'DISTRIMED', url: 'https://inovacao.distrimed.com.br/login?referencia=/solicitacaoSac', usuario: 'bela farma sul', min: 350.0, prazo: 28, uf: 'MG', is_mg: 1, obs: 'Distribuidora Oficial - Importação automática via modal' },
      { id: 'divimed', nome: 'DIVIMED', url: 'https://divimed.artpedidoweb.com.br/#/', usuario: 'belafarmasul@gmail.com', min: 400.0, prazo: 28, uf: 'MG', is_mg: 1, obs: 'Distribuidora Oficial - Montagem robótica produto por produto por nome' },
      { id: 'martins', nome: 'MARTINS ATACADO', url: 'https://www.martinsatacado.com.br/login/pessoa-juridica?pathName=%2F', usuario: '47.378.578/0001-40', min: 200.0, prazo: 28, uf: 'MG', is_mg: 1, obs: 'Distribuidora Oficial - Pedido mínimo R$ 200,00 - Filtro estrito: apenas produtos faturados em MG' }
    ];

    const stmtUpsert = db.prepare(`
      INSERT INTO belaped_portais (id, nome, url_portal, usuario, pedido_minimo, prazo_dias_padrao, uf_origem, is_mg, is_ativo, observacoes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(id) DO UPDATE SET
        nome = excluded.nome,
        url_portal = excluded.url_portal,
        usuario = excluded.usuario,
        pedido_minimo = excluded.pedido_minimo,
        is_ativo = 1,
        observacoes = excluded.observacoes
    `);

    for (const p of portaisReais) {
      stmtUpsert.run(p.id, p.nome, p.url, p.usuario, p.min, p.prazo, p.uf, p.is_mg, p.obs);
    }

    // Remove qualquer distribuidora não configurada (garante apenas as 6 oficiais)
    db.prepare(`DELETE FROM belaped_portais WHERE id NOT IN ('profarma', 'dpc', 'soton', 'distrimed', 'divimed', 'martins')`).run();

    // Migração transparente: Coluna url_produto para salvar link direto do produto pesquisado pelo robô
    try {
      db.prepare(`ALTER TABLE belaped_cotacoes_reais ADD COLUMN url_produto TEXT`).run();
    } catch (migErr) {
      // Coluna já existe
    }
  };

  try {
    initTables();
  } catch (e) {
    console.error('[BelaPed] Erro ao inicializar tabelas:', e.message);
  }

  /**
   * POST /api/belaped/sincronizar-estoque
   * Força a atualização imediata da lista de produtos/saldos/compras com o ERP Digifarma
   */
  router.post('/sincronizar-estoque', async (req, res) => {
    try {
      const resultado = await sincronizarListaProdutosERP('manual-ui');
      res.json(resultado);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/belaped/faltas-7d
   * Retorna os produtos em ruptura ou com saldo crítico para reposição de 1 SEMANA (7 dias)
   * - Inclui Curva A e B sem corte artificial (sem LIMIT 200 que escondia a Curva B)
   * - Inclui Curva C / Esquecidos 6m (saldo <= 0 que teve vendas reais nos últimos 6 a 10 meses)
   * - Dupla Proteção de Equivalentes:
   *   1) Oculta da lista se outro laboratório do mesmo princípio ativo + dosagem + apresentação já tiver estoque na loja
   *   2) Agrupa laboratórios zerados equivalentes em 1 único representante (menor preço cotado ou maior giro)
   * - Equalizador Inteligente de Volumes: corta gordura dos grandes volumes e garante 1 a 2 un. ("estoque semente") para esquecidos
   */
  router.get('/faltas-7d', (req, res) => {
  console.log('[BelaPed] Iniciando handler /faltas-7d');
    try {
      const { busca, curva, categoria, equalizar, teto_max } = req.query;
      const equalizarAtivo = equalizar === undefined ? true : (equalizar !== '0' && equalizar !== 'false');
      const tetoMaxUnidades = teto_max !== undefined ? Math.max(0, parseInt(String(teto_max), 10) || 0) : 10;

      // 1. Consulta sem corte de LIMIT 200: traz toda a Curva A, Curva B e Curva C ativa no histórico (6-10 meses)
      let query = `
        SELECT 
          c.produto_id,
          c.descricao,
          c.apresentacao,
          c.ean,
          c.curva_abc,
          c.saldo,
          c.est_minimo_calculado,
          c.vmd_ponderado,
          c.vendas_30d,
          c.vendas_31_60d,
          COALESCE(c.vendas_61_90d, 0) as vendas_61_90d,
          COALESCE(c.vendas_10m, 0) as vendas_10m,
          c.custo_unitario,
          c.status_ruptura,
          c.preco_venda_vigente,
          c.categoria_id,
          c.preco_unitario_ult_compra,
          c.ultima_compra_fornecedor,
          c.ultima_compra_data,
          c.ultima_compra_nf
        FROM compras_estoque_cache c
        WHERE (c.saldo <= 0 OR c.saldo < c.est_minimo_calculado)
          AND (
            c.curva_abc IN ('A', 'B')
            OR (
              c.curva_abc = 'C'
              AND c.saldo <= 0
              AND (
                COALESCE(c.vendas_10m, 0) > 0
                OR COALESCE(c.vendas_61_90d, 0) > 0
                OR COALESCE(c.vendas_31_60d, 0) > 0
                OR COALESCE(c.vendas_30d, 0) > 0
              )
            )
          )
      `;

      const params = [];

      if (curva && ['A', 'B', 'C'].includes(String(curva).toUpperCase())) {
        query += ` AND c.curva_abc = ?`;
        params.push(String(curva).toUpperCase());
      }

      if (busca) {
        query += ` AND (c.descricao LIKE ? OR c.ean LIKE ?)`;
        params.push(`%${busca}%`, `%${busca}%`);
      }

      query += ` ORDER BY 
        CASE c.status_ruptura WHEN 'RUPTURA' THEN 1 WHEN 'ABAIXO_MINIMO' THEN 2 ELSE 3 END ASC,
        CASE c.curva_abc WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END ASC,
        c.vmd_ponderado DESC
      `;

      const rows = db.prepare(query).all(...params);

      // Itens avulsos adicionados manualmente pelo usuário
      const avulsos = db.prepare(`SELECT * FROM belaped_itens_avulsos ORDER BY created_at DESC`).all();

      // Cotações reais obtidas pelos robôs (Profarma, DPC, Soton, Distrimed)
      const cotacoesReaisMap = {};
      const eansConsultadosSet = new Set();
      try {
        const todasCotacoes = db.prepare(`SELECT * FROM belaped_cotacoes_reais ORDER BY preco ASC`).all();
        for (const c of todasCotacoes) {
          if (c.ean) eansConsultadosSet.add(c.ean);
          if (c.disponivel === 1 && c.preco > 0) {
            if (!cotacoesReaisMap[c.ean]) cotacoesReaisMap[c.ean] = [];
            cotacoesReaisMap[c.ean].push(c);
          }
        }
      } catch (e) {}

      // 2. Motor de Equivalentes (Princípio Ativo + Dosagem + Quantidade na caixa)
      // Mapeia vínculos manuais + equivalência farmacêutica automática em todo o estoque positivo da loja
      const vinculosManuaisMap = new Map();
      try {
        const vinculos = db.prepare(`SELECT produto_id, grupo_id FROM compras_produtos_equivalentes`).all();
        for (const v of vinculos) {
          vinculosManuaisMap.set(Number(v.produto_id), `MANUAL_${v.grupo_id}`);
        }
      } catch (e) {}

      const obterChaveEquivalencia = (prodId, descricao, categoriaId) => {
        if (vinculosManuaisMap.has(Number(prodId))) {
          return vinculosManuaisMap.get(Number(prodId));
        }
        const isMed = categoriaId !== 5 && categoriaId !== 7;
        if (!isMed || !comprasEquivalentesService || typeof comprasEquivalentesService.extrairAtributosProduto !== 'function') {
          return null;
        }
        const attr = comprasEquivalentesService.extrairAtributosProduto(descricao || '');
        if (!attr || !attr.dosagem || !attr.principio || attr.principio === 'OUTROS' || attr.principio.length < 4) {
          return null;
        }
        return attr.chave;
      };

      // Mapeia todo o estoque positivo na farmácia por chave de equivalência para saber se outro laboratório cobre a demanda
      const estoqueGrupoEquivMap = new Map();
      try {
        const catálogoComSaldoOuGiro = db.prepare(`
          SELECT produto_id, descricao, categoria_id, saldo, vmd_ponderado
          FROM compras_estoque_cache
          WHERE saldo > 0 OR curva_abc IN ('A', 'B')
        `).all();
        for (const p of catálogoComSaldoOuGiro) {
          const chaveEq = obterChaveEquivalencia(p.produto_id, p.descricao, p.categoria_id);
          if (!chaveEq) continue;
          let grp = estoqueGrupoEquivMap.get(chaveEq);
          if (!grp) {
            grp = { saldoPositivoTotal: 0, vmdTotal: 0, labsComEstoque: [] };
            estoqueGrupoEquivMap.set(chaveEq, grp);
          }
          const s = Number(p.saldo) || 0;
          if (s > 0) {
            grp.saldoPositivoTotal += s;
            grp.labsComEstoque.push({ produto_id: p.produto_id, descricao: p.descricao, saldo: s });
          }
          grp.vmdTotal += Math.max(0, Number(p.vmd_ponderado) || 0);
        }
      } catch (e) {}

      let ocultadosEquivalenteComEstoque = 0;
      let agrupadosEquivalenciaCount = 0;

      // 3. Processa os candidatos e aplica Proteção 1 (Ocultar se outro laboratório equivalente já tiver estoque suficiente)
      const candidatosProcessados = [];

      for (const r of rows) {
        const vmd = Number(r.vmd_ponderado) || 0;
        const saldo = Number(r.saldo) || 0;
        const vendas30d = Number(r.vendas_30d) || 0;
        const vendas31_60d = Number(r.vendas_31_60d) || 0;
        const vendas61_90d = Number(r.vendas_61_90d) || 0;
        const vendas10m = Number(r.vendas_10m) || 0;
        const vendasHistoricoAntigo = Math.max(vendas10m - vendas30d, vendas31_60d + vendas61_90d);

        // Identifica se é um produto "Esquecido nos últimos 6 meses":
        // Acabou o estoque (saldo <= 0), parou de vender nos últimos 30 dias (porque não tinha na prateleira), mas vendia antes!
        const isEsquecido6m = saldo <= 0 && vendas30d === 0 && (vendasHistoricoAntigo > 0 || vendas10m > 0);

        const diasCobertura = vmd > 0 && saldo > 0 ? Number((saldo / vmd).toFixed(1)) : (saldo <= 0 ? 0 : 99);

        // REGRA DE COBERTURA: Se o estoque atual aguenta 7 dias ou mais, não precisa comprar agora
        if (saldo > 0 && diasCobertura >= 7) continue;
        if (r.curva_abc === 'B' && saldo > 0 && diasCobertura >= 4) continue;
        if (r.curva_abc !== 'A' && r.curva_abc !== 'B' && saldo > 0) continue;

        // Se for Curva C com saldo <= 0 mas sem nenhuma venda nos últimos 6-10 meses, ignora cadastro morto
        if (r.curva_abc === 'C' && vendas30d === 0 && vendas31_60d === 0 && vendas61_90d === 0 && vendas10m === 0) {
          continue;
        }

        // PROTEÇÃO 1 DE EQUIVALENTES:
        // Verifica se outro laboratório do mesmo medicamento + dosagem + apresentação já tem estoque na loja cobrindo a semana
        const chaveEq = obterChaveEquivalencia(r.produto_id, r.descricao, r.categoria_id);
        if (chaveEq && estoqueGrupoEquivMap.has(chaveEq)) {
          const grpEq = estoqueGrupoEquivMap.get(chaveEq);
          const necessidadeGrupoSemana = Math.max(2, Math.ceil(grpEq.vmdTotal * 5));
          // Se o próprio item está zerado (ou baixo), mas a soma dos laboratórios equivalentes na prateleira cobre a necessidade
          if (grpEq.saldoPositivoTotal > saldo && grpEq.saldoPositivoTotal >= necessidadeGrupoSemana) {
            ocultadosEquivalenteComEstoque++;
            continue;
          }
          // Para itens Esquecidos 6m / Curva C: se já existe pelo menos 1 unidade de outro laboratório equivalente na prateleira, não é ruptura!
          if ((isEsquecido6m || r.curva_abc === 'C') && grpEq.saldoPositivoTotal >= 1) {
            ocultadosEquivalenteComEstoque++;
            continue;
          }
        }

        candidatosProcessados.push({
          raw: r,
          vmd,
          saldo,
          vendas30d,
          vendasHistorico6m: Math.max(vendas10m, vendas30d + vendas31_60d + vendas61_90d),
          isEsquecido6m,
          diasCobertura,
          chaveEq
        });
      }

      // 4. PROTEÇÃO 2 DE EQUIVALENTES:
      // Se múltiplos laboratórios do mesmo medicamento estão TODOS zerados, agrupa em 1 único representante!
      // Escolhe o representante com menor preço cotado nas distribuidoras ou maior giro recente.
      const gruposZeradosMap = new Map();
      const candidatosFinais = [];

      for (const cand of candidatosProcessados) {
        if (!cand.chaveEq) {
          candidatosFinais.push({ ...cand, equivalentesAgrupados: [] });
          continue;
        }
        if (!gruposZeradosMap.has(cand.chaveEq)) {
          gruposZeradosMap.set(cand.chaveEq, []);
        }
        gruposZeradosMap.get(cand.chaveEq).push(cand);
      }

      for (const [chaveEq, listaGrupo] of gruposZeradosMap.entries()) {
        if (listaGrupo.length === 1) {
          candidatosFinais.push({ ...listaGrupo[0], equivalentesAgrupados: [] });
          continue;
        }

        // Ordena para eleger o melhor representante do grupo equivalente zerado:
        // 1º: Tem cotação disponível nos portais com menor preço
        // 2º: Maior VMD / vendas recentes
        // 3º: Menor custo de última compra
        listaGrupo.sort((a, b) => {
          const cotA = a.raw.ean && cotacoesReaisMap[a.raw.ean]?.length > 0 ? cotacoesReaisMap[a.raw.ean][0].preco : Infinity;
          const cotB = b.raw.ean && cotacoesReaisMap[b.raw.ean]?.length > 0 ? cotacoesReaisMap[b.raw.ean][0].preco : Infinity;
          if (cotA !== cotB) return cotA - cotB;
          if (b.vmd !== a.vmd) return b.vmd - a.vmd;
          if (b.vendasHistorico6m !== a.vendasHistorico6m) return b.vendasHistorico6m - a.vendasHistorico6m;
          return (Number(a.raw.custo_unitario) || 9999) - (Number(b.raw.custo_unitario) || 9999);
        });

        const vencedor = listaGrupo[0];
        const outros = listaGrupo.slice(1);
        agrupadosEquivalenciaCount += outros.length;

        // Consolida o VMD e histórico do grupo no representante vencedor para não perder a dimensão real do giro da molécula
        const vmdConsolidado = listaGrupo.reduce((acc, item) => acc + item.vmd, 0);
        const vendas30dConsolidado = listaGrupo.reduce((acc, item) => acc + item.vendas30d, 0);
        const vendasHistConsolidado = listaGrupo.reduce((acc, item) => acc + item.vendasHistorico6m, 0);
        const melhorCurva = listaGrupo.some(i => i.raw.curva_abc === 'A')
          ? 'A'
          : (listaGrupo.some(i => i.raw.curva_abc === 'B') ? 'B' : vencedor.raw.curva_abc);

        candidatosFinais.push({
          ...vencedor,
          raw: {
            ...vencedor.raw,
            curva_abc: melhorCurva
          },
          vmd: vmdConsolidado,
          vendas30d: vendas30dConsolidado,
          vendasHistorico6m: vendasHistConsolidado,
          isEsquecido6m: vencedor.saldo <= 0 && vendas30dConsolidado === 0 && vendasHistConsolidado > 0,
          equivalentesAgrupados: outros.map(o => o.raw.descricao)
        });
      }

      // Busca todas as faltas ativas da Guia de Faltas do Belinha (balcão/WhatsApp)
      let todasFaltasBelinha = [];
      const faltasBelinhaMap = new Map();
      try {
        todasFaltasBelinha = db.prepare(`
          SELECT id, productName, type, clientInquiry, notes, createdAt, userName, source, purchased, ordered
          FROM shortages
          WHERE purchased = 0
          ORDER BY createdAt DESC
        `).all();

        for (const fb of todasFaltasBelinha) {
          if (fb.productName) {
            const cleanName = fb.productName.toUpperCase().trim();
            faltasBelinhaMap.set(cleanName, fb);
          }
        }
      } catch (errShort) {
        console.warn('[BelaPed] Tabela shortages não disponível:', errShort.message);
      }

      let totalOrcado7d = 0;
      let totalItensRuptura = 0;
      let totalItensAbaixoMinimo = 0;
      let totalEsquecidos6m = 0;
      let unidadesCortadasEqualizador = 0;
      let economiaEqualizadorReais = 0;

      const items = candidatosFinais.map(cand => {
        const { raw: r, vmd, saldo, vendas30d, vendasHistorico6m, isEsquecido6m, diasCobertura, chaveEq, equivalentesAgrupados } = cand;
        const custo = Number(r.preco_unitario_ult_compra) || Number(r.custo_unitario) || 0;

        // Cruzamento com a Guia de Faltas do Belinha
        let faltaBelinhaMatch = null;
        const descUpper = (r.descricao || '').toUpperCase().trim();
        if (faltasBelinhaMap.has(descUpper)) {
          faltaBelinhaMatch = faltasBelinhaMap.get(descUpper);
        } else {
          for (const [nomeBalcao, fb] of faltasBelinhaMap.entries()) {
            if (nomeBalcao.length >= 5 && (descUpper.includes(nomeBalcao) || nomeBalcao.includes(descUpper))) {
              faltaBelinhaMatch = fb;
              break;
            }
          }
        }

        // Meta bruta de 1 semana (7 dias) com 15% de margem de segurança (sem somar saldo negativo virtual)
        const necessidade7d = Math.ceil(vmd * 7 * 1.15);
        const saldoFisico = Math.max(0, saldo);
        const qtdBruta7d = Math.max(1, necessidade7d - saldoFisico);

        if (saldo <= 0) {
          totalItensRuptura++;
        } else {
          totalItensAbaixoMinimo++;
        }
        if (isEsquecido6m) {
          totalEsquecidos6m++;
        }

        // Verifica se há cotação REAL capturada pelos robôs para este EAN
        const cotacoesReais = r.ean ? cotacoesReaisMap[r.ean] : null;
        const jaConsultado = r.ean ? eansConsultadosSet.has(r.ean) : false;
        let fornecedor1 = '';
        let preco1 = 0;
        let urlProduto1 = null;
        let fornecedor2 = '';
        let preco2 = 0;
        let diferencaPct = 0;

        if (cotacoesReais && cotacoesReais.length > 0) {
          fornecedor1 = cotacoesReais[0].fornecedor;
          preco1 = Number(cotacoesReais[0].preco.toFixed(2));
          urlProduto1 = cotacoesReais[0].url_produto || null;

          if (cotacoesReais.length > 1) {
            fornecedor2 = cotacoesReais[1].fornecedor;
            preco2 = Number(cotacoesReais[1].preco.toFixed(2));
            diferencaPct = preco1 > 0 ? Number((((preco2 - preco1) / preco1) * 100).toFixed(1)) : 0;
          } else {
            fornecedor2 = '—';
            preco2 = 0;
            diferencaPct = 0;
          }
        } else if (jaConsultado) {
          fornecedor1 = 'Sem Estoque (Portais)';
          preco1 = Number(custo.toFixed(2));
          fornecedor2 = '—';
          preco2 = 0;
          diferencaPct = 0;
        } else {
          fornecedor1 = 'Não Cotado';
          preco1 = Number(custo.toFixed(2));
          fornecedor2 = '—';
          preco2 = 0;
          diferencaPct = 0;
        }

        // 5. EQUALIZADOR INTELIGENTE DE VOLUMES:
        // - Para Esquecidos (6m) ou Curva C em ruptura: garante 1 a 2 unidades ("estoque semente") para recompor a vitrine
        // - Para itens caros (>= R$ 35) ou de alto volume: reduz a gordura para 5 dias reais e aplica o teto máximo por item
        let qtdEqualizada7d = qtdBruta7d;
        if (isEsquecido6m || r.curva_abc === 'C') {
          qtdEqualizada7d = vendasHistorico6m >= 6 ? 2 : 1;
        } else {
          let metaEnxuta = preco1 >= 35
            ? Math.max(1, Math.ceil(vmd * 5) - saldoFisico)
            : Math.max(1, Math.ceil(vmd * 6.5) - saldoFisico);
          if (tetoMaxUnidades > 0) {
            metaEnxuta = Math.min(metaEnxuta, tetoMaxUnidades);
          }
          qtdEqualizada7d = Math.max(1, metaEnxuta);
        }

        const qtdSugerida7d = equalizarAtivo ? qtdEqualizada7d : qtdBruta7d;
        if (qtdBruta7d > qtdEqualizada7d) {
          const diffUn = qtdBruta7d - qtdEqualizada7d;
          unidadesCortadasEqualizador += diffUn;
          economiaEqualizadorReais += diffUn * preco1;
        }

        const subtotal7d = Number((qtdSugerida7d * preco1).toFixed(2));
        totalOrcado7d += subtotal7d;

        const precoVenda = Number((Number(r.preco_venda_vigente) || 0).toFixed(2));
        const margemLucro = precoVenda > preco1 && precoVenda > 0
          ? Number((((precoVenda - preco1) / precoVenda) * 100).toFixed(1))
          : 0;

        const precoUltCompra = Number(custo.toFixed(2));
        const temPrecoCotado = Boolean(cotacoesReais && cotacoesReais.length > 0 && preco1 > 0);
        const variacaoUltCompraPct = (temPrecoCotado && precoUltCompra > 0)
          ? Number((((preco1 - precoUltCompra) / precoUltCompra) * 100).toFixed(1))
          : 0;

        const isCurvaAlta = r.curva_abc === 'A' || r.curva_abc === 'B';
        let prioridade = 'P4';
        let prioridadeRotulo = 'Regular';
        if (saldo <= 0 && isCurvaAlta) {
          prioridade = 'P1';
          prioridadeRotulo = 'Ruptura Crítica';
        } else if (saldo <= 0 && !isCurvaAlta) {
          prioridade = (vendas30d > 0 || isEsquecido6m) ? 'P2' : 'P4';
          prioridadeRotulo = prioridade === 'P2' ? 'Risco Iminente' : 'Regular';
        } else if (isCurvaAlta && (diasCobertura <= 3 || saldo <= Math.max(1, vmd * 3))) {
          prioridade = 'P2';
          prioridadeRotulo = 'Risco Iminente';
        } else if (vendas30d > 0 || isCurvaAlta) {
          prioridade = 'P3';
          prioridadeRotulo = 'Orçamento Semanal';
        } else {
          prioridade = 'P4';
          prioridadeRotulo = 'Regular';
        }

        const catUpper = String(r.categoria || r.categoria_id || '').toUpperCase();
        const isMedicamento = catUpper.includes('MED') || catUpper.includes('ETICO') || catUpper.includes('GEN') || catUpper.includes('SIM') ||
          /\b(\d+\s*(MG|ML|MCG|G)|CPR|COMP|CAPS|GOTAS|POMADA|CREME|XPE|SUSP)\b/i.test(descUpper);

        return {
          produto_id: r.produto_id,
          descricao: r.descricao,
          apresentacao: r.apresentacao || '',
          ean: r.ean || '',
          curva_abc: r.curva_abc || 'C',
          prioridade: prioridade,
          prioridade_rotulo: prioridadeRotulo,
          saldo: saldo,
          vmd_ponderado: Number(vmd.toFixed(2)),
          vendas_30d: vendas30d,
          vendas_historico_6m: vendasHistorico6m,
          is_esquecido_6m: isEsquecido6m,
          chave_equivalencia: chaveEq || null,
          equivalentes_agrupados_count: equivalentesAgrupados ? equivalentesAgrupados.length : 0,
          equivalentes_agrupados_nomes: equivalentesAgrupados || [],
          dias_estoque_restante: diasCobertura,
          status_ruptura: isEsquecido6m ? 'ESQUECIDO_6M' : (saldo <= 0 ? 'RUPTURA' : 'RISCO_SEMANAL'),
          custo_unitario: preco1,
          preco_ult_compra: precoUltCompra,
          variacao_ult_compra_pct: variacaoUltCompraPct,
          preco_venda_vigente: precoVenda,
          margem_lucro_percentual: margemLucro,
          
          // Cotação Integrada: 1º e 2º Colocados
          fornecedor_1: fornecedor1,
          preco_1: preco1,
          url_produto_1: urlProduto1,
          fornecedor_2: fornecedor2,
          preco_2: preco2,
          diferenca_percentual: diferencaPct,

          fornecedor_ult_compra: r.ultima_compra_fornecedor || 'Não registrado',
          data_ult_compra: r.ultima_compra_data || '',
          nf_ult_compra: r.ultima_compra_nf || '',
          qtd_bruta_7d: qtdBruta7d,
          qtd_equalizada_7d: qtdEqualizada7d,
          qtd_sugerida_7d: qtdSugerida7d,
          subtotal_7d: subtotal7d,
          tipo_categoria: isMedicamento ? 'MEDICAMENTO' : 'PERFUMARIA',
          falta_balcao_belinha: faltaBelinhaMatch ? {
            id: faltaBelinhaMatch.id,
            productName: faltaBelinhaMatch.productName,
            clientInquiry: Boolean(faltaBelinhaMatch.clientInquiry),
            notes: faltaBelinhaMatch.notes || '',
            userName: faltaBelinhaMatch.userName || 'Balcão',
            createdAt: faltaBelinhaMatch.createdAt,
            source: faltaBelinhaMatch.source || 'Balcão'
          } : null
        };
      }).filter(Boolean);

      // Ordenação estratégica pela Matriz de Gravidade Operacional:
      // 1. Prioridade P1 (Ruptura Crítica) -> P2 (Risco Iminente) -> P3 (Orçamento) -> P4 (Regular)
      // 2. Ruptura real (saldo <= 0) no topo absoluto de cada grupo
      // 3. Ordem de Curva A -> B -> C
      // 4. Maior giro / retorno para a loja
      const pesoPrioridade = { P1: 1, P2: 2, P3: 3, P4: 4 };
      items.sort((a, b) => {
        const pa = pesoPrioridade[a.prioridade] || 4;
        const pb = pesoPrioridade[b.prioridade] || 4;
        if (pa !== pb) return pa - pb;
        if (a.saldo <= 0 && b.saldo > 0) return -1;
        if (b.saldo <= 0 && a.saldo > 0) return 1;
        const ordemCurva = { A: 1, B: 2, C: 3 };
        const ca = ordemCurva[a.curva_abc] || 3;
        const cb = ordemCurva[b.curva_abc] || 3;
        if (ca !== cb) return ca - cb;
        return (b.margem_lucro_percentual * Math.max(0.05, b.vmd_ponderado)) - (a.margem_lucro_percentual * Math.max(0.05, a.vmd_ponderado));
      });

      // Resumo consolidado por distribuidora vencedora (1º Colocado)
      const portaisCadastrados = db.prepare(`SELECT nome, pedido_minimo, prazo_dias_padrao FROM belaped_portais WHERE is_ativo = 1`).all();
      const mapaMinimos = {};
      for (const p of portaisCadastrados) {
        mapaMinimos[String(p.nome).toUpperCase()] = {
          pedido_minimo: Number(p.pedido_minimo) || 300,
          prazo_dias: Number(p.prazo_dias_padrao) || 28
        };
      }

      const gruposMap = {};
      for (const it of items) {
        const chave = it.fornecedor_1 || 'Não Cotado';
        if (!gruposMap[chave]) {
          const cfg = mapaMinimos[chave.toUpperCase()] || { pedido_minimo: 0, prazo_dias: 28 };
          gruposMap[chave] = {
            distribuidora: chave,
            qtd_produtos: 0,
            qtd_unidades: 0,
            valor_total: 0,
            pedido_minimo: cfg.pedido_minimo,
            prazo_dias: cfg.prazo_dias,
            atingiu_minimo: false,
            falta_para_minimo: 0
          };
        }
        gruposMap[chave].qtd_produtos += 1;
        gruposMap[chave].qtd_unidades += Number(it.qtd_sugerida_7d) || 0;
        gruposMap[chave].valor_total = Number((gruposMap[chave].valor_total + (Number(it.subtotal_7d) || 0)).toFixed(2));
      }

      const resumoDistribuidoras = Object.values(gruposMap).map(g => {
        const min = Number(g.pedido_minimo) || 0;
        const atingiu = min > 0 ? g.valor_total >= min : true;
        return {
          ...g,
          atingiu_minimo: atingiu,
          falta_para_minimo: min > 0 && !atingiu ? Number((min - g.valor_total).toFixed(2)) : 0
        };
      });

      res.json({
        success: true,
        meta_cobertura: 'Equalização Anti-Ruptura: Curvas A, B e Resgate 6m sem duplicar equivalentes',
        total_itens: items.length,
        total_ruptura: totalItensRuptura,
        total_abaixo_minimo: totalItensAbaixoMinimo,
        total_esquecidos_6m: totalEsquecidos6m,
        ocultados_equivalente_com_estoque: ocultadosEquivalenteComEstoque,
        agrupados_equivalencia: agrupadosEquivalenciaCount,
        unidades_cortadas_equalizador: unidadesCortadasEqualizador,
        economia_equalizador_reais: Number(economiaEqualizadorReais.toFixed(2)),
        equalizar_ativo: equalizarAtivo,
        teto_max_unidades: tetoMaxUnidades,
        total_orcado_7d: Number(totalOrcado7d.toFixed(2)),
        resumo_distribuidoras: resumoDistribuidoras,
        items,
        itens_avulsos: avulsos,
        total_faltas_balcao_belinha: todasFaltasBelinha.length,
        faltas_balcao_belinha_lista: todasFaltasBelinha
      });
    } catch (err) {
      console.error('[BelaPed] Erro em faltas-7d:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/belaped/itens-avulsos
   * Permite incluir produtos avulsos na cotação
   */
  router.post('/itens-avulsos', (req, res) => {
    try {
      const { produto_id, descricao, ean, quantidade, preco_referencia, motivo, usuario } = req.body;

      if (!descricao || !quantidade) {
        return res.status(400).json({ success: false, error: 'Descrição e quantidade são obrigatórios.' });
      }

      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO belaped_itens_avulsos (id, produto_id, descricao, ean, quantidade, preco_referencia, motivo, adicionado_por)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        produto_id || null,
        descricao.toUpperCase().trim(),
        ean || null,
        Number(quantidade) || 1,
        Number(preco_referencia) || 0,
        motivo || 'Demanda de balcão',
        usuario || 'Operador'
      );

      res.json({ success: true, id, message: 'Item adicionado à cotação com sucesso.' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * DELETE /api/belaped/itens-avulsos/:id
   */
  router.delete('/itens-avulsos/:id', (req, res) => {
    try {
      const { id } = req.params;
      db.prepare(`DELETE FROM belaped_itens_avulsos WHERE id = ?`).run(id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/belaped/orcamento-boletos
   * REGRA MASTER: Análise do teto orçamentário real da tabela monthly_limits do mês atual e próximos meses,
   * somatória dos boletos reais por vencimento (due_date) e cálculo exato de saldo/excedente.
   */
  router.get('/orcamento-boletos', (req, res) => {
  console.log('[BelaPed] Iniciando handler /orcamento-boletos');
  try {
      const hoje = new Date();
      const mesAtual = hoje.getMonth() + 1;
      const anoAtual = hoje.getFullYear();
      const diaHoje = hoje.getDate();

      // 1. Busca tetos orçamentários reais na tabela oficial monthly_limits (month 1..12, year, "limit")
      const limitsMap = {};
      try {
        const mlRows = db.prepare(`SELECT month, year, "limit" FROM monthly_limits`).all();
        mlRows.forEach(r => {
          limitsMap[`${r.year}_${r.month}`] = Number(r.limit) || 0;
        });
      } catch (e) {}

      // Fallback secundário em system_settings se algum mês não estiver em monthly_limits
      try {
        const sysRows = db.prepare(`SELECT key, value FROM system_settings WHERE key LIKE 'monthly_limit_%'`).all();
        sysRows.forEach(r => {
          const k = String(r.key).replace('monthly_limit_', '');
          if (!limitsMap[k]) limitsMap[k] = Number(r.value) || 0;
        });
      } catch (e) {}

      // 2. Busca boletos reais da tabela oficial boletos (coluna due_date)
      const boletosRows = db.prepare(`
        SELECT id, supplierName, due_date, value, status
        FROM boletos
        WHERE LOWER(COALESCE(status, '')) NOT IN ('cancelado', 'rejeitado')
      `).all();

      // Função para calcular meses (atual, +1, +2) com os mesmos valores do Painel de Orçamentos
      const calcularMes = (mesNum, anoNum) => {
        const key = `${anoNum}_${mesNum}`;
        const limiteConfigurado = limitsMap[key] !== undefined ? limitsMap[key] : 12500.0;

        // Filtra boletos que vencem neste mês/ano usando due_date (YYYY-MM-DD)
        const mesStr = String(mesNum).padStart(2, '0');
        const prefixoData = `${anoNum}-${mesStr}`;

        const boletosDoMes = boletosRows.filter(b => {
          const rawDue = String(b.due_date || b.dueDate || '').split('T')[0];
          return rawDue.startsWith(prefixoData);
        });

        const totalBoletos = boletosDoMes.reduce((acc, b) => acc + (Number(b.value) || 0), 0);
        const totalPago = boletosDoMes
          .filter(b => String(b.status || '').toLowerCase() === 'pago')
          .reduce((acc, b) => acc + (Number(b.value) || 0), 0);
        const totalPendente = boletosDoMes
          .filter(b => String(b.status || '').toLowerCase() !== 'pago')
          .reduce((acc, b) => acc + (Number(b.value) || 0), 0);

        const saldoLivre = limiteConfigurado - totalBoletos;
        const percentualComprometido = limiteConfigurado > 0 ? Number(((totalBoletos / limiteConfigurado) * 100).toFixed(1)) : 0;

        let statusOrcamento = 'LIBERADO';
        if (saldoLivre < 0 || percentualComprometido > 100) {
          statusOrcamento = 'ESTOURADO';
        } else if (percentualComprometido >= 80) {
          statusOrcamento = 'ALERTA';
        }

        // 3. Divisão do mês em semanas do calendário e cálculo do limite semanal de gasto
        const totalDiasNoMes = new Date(anoNum, mesNum, 0).getDate();
        const definicoesSemanas = [
          { numero: 1, inicio: 1, fim: 7 },
          { numero: 2, inicio: 8, fim: 14 },
          { numero: 3, inicio: 15, fim: 21 },
          { numero: 4, inicio: 22, fim: 28 }
        ];
        if (totalDiasNoMes > 28) {
          definicoesSemanas.push({ numero: 5, inicio: 29, fim: totalDiasNoMes });
        }

        const qtdSemanas = definicoesSemanas.length;
        const limiteSemanalPadrao = Number((limiteConfigurado / qtdSemanas).toFixed(2));

        const semanas = definicoesSemanas.map(def => {
          const boletosSemana = boletosDoMes.filter(b => {
            const rawDue = String(b.due_date || b.dueDate || '').split('T')[0];
            const parts = rawDue.split('-');
            const diaVenc = Number(parts[2]) || 0;
            return diaVenc >= def.inicio && diaVenc <= def.fim;
          });

          const compSemana = boletosSemana.reduce((acc, b) => acc + (Number(b.value) || 0), 0);
          const pagoSemana = boletosSemana
            .filter(b => String(b.status || '').toLowerCase() === 'pago')
            .reduce((acc, b) => acc + (Number(b.value) || 0), 0);
          const pendSemana = boletosSemana
            .filter(b => String(b.status || '').toLowerCase() !== 'pago')
            .reduce((acc, b) => acc + (Number(b.value) || 0), 0);
          const saldoSemana = limiteSemanalPadrao - compSemana;
          const pctSemana = limiteSemanalPadrao > 0 ? Number(((compSemana / limiteSemanalPadrao) * 100).toFixed(1)) : 0;

          let statusSemana = 'LIBERADO';
          if (saldoSemana < 0 || pctSemana > 100) {
            statusSemana = 'ESTOURADO';
          } else if (pctSemana >= 80) {
            statusSemana = 'ALERTA';
          }

          const isSemanaAtual = (anoNum === anoAtual && mesNum === mesAtual && diaHoje >= def.inicio && diaHoje <= def.fim);
          const dataIniStr = `${String(def.inicio).padStart(2, '0')}/${mesStr}`;
          const dataFimStr = `${String(def.fim).padStart(2, '0')}/${mesStr}`;

          return {
            numero: def.numero,
            nome: `Semana ${def.numero}`,
            periodo: `${dataIniStr} a ${dataFimStr}`,
            diaInicio: def.inicio,
            diaFim: def.fim,
            limiteSemanal: limiteSemanalPadrao,
            totalComprometido: Number(compSemana.toFixed(2)),
            totalPago: Number(pagoSemana.toFixed(2)),
            totalPendente: Number(pendSemana.toFixed(2)),
            saldoLivreSemana: Number(saldoSemana.toFixed(2)),
            percentualComprometido: pctSemana,
            statusSemana,
            isSemanaAtual,
            qtdBoletos: boletosSemana.length
          };
        });

        const semanaAtualVigente = semanas.find(s => s.isSemanaAtual) || semanas[0];

        return {
          mes: mesNum,
          ano: anoNum,
          nomeMes: new Date(anoNum, mesNum - 1, 1).toLocaleString('pt-BR', { month: 'long' }),
          limite: Number(limiteConfigurado.toFixed(2)),
          limiteSemanalPadrao,
          qtdSemanas,
          totalComprometido: Number(totalBoletos.toFixed(2)),
          totalPago: Number(totalPago.toFixed(2)),
          totalPendente: Number(totalPendente.toFixed(2)),
          saldoLivre: Number(saldoLivre.toFixed(2)),
          percentualComprometido,
          statusOrcamento,
          qtdBoletos: boletosDoMes.length,
          semanas,
          semanaAtual: semanaAtualVigente
        };
      };

      const mes0 = calcularMes(mesAtual, anoAtual);
      const proximoMes = mesAtual === 12 ? 1 : mesAtual + 1;
      const proximoAno = mesAtual === 12 ? anoAtual + 1 : anoAtual;
      const mes1 = calcularMes(proximoMes, proximoAno);

      const mesSeguinte = proximoMes === 12 ? 1 : proximoMes + 1;
      const mesSeguinteAno = proximoMes === 12 ? proximoAno + 1 : proximoAno;
      const mes2 = calcularMes(mesSeguinte, mesSeguinteAno);

      // Calcula o cronograma semanal de todos os 12 meses do ano para consulta completa
      const todosMesesAno = [];
      for (let m = 1; m <= 12; m++) {
        todosMesesAno.push(calcularMes(m, anoAtual));
      }

      // Dias restantes no mês atual
      const ultimoDiaMes = new Date(anoAtual, mesAtual, 0).getDate();
      const diasRestantesMesAtual = ultimoDiaMes - diaHoje;

      // REGRA MASTER: Orientação estratégica fiel aos números reais
      let regraMasterMensagem = '';
      let recomendacaoPrazoMinimo = 0;

      if (mes0.statusOrcamento === 'ESTOURADO') {
        if (mes1.statusOrcamento === 'ESTOURADO') {
          const diasMes1 = new Date(proximoAno, proximoMes, 0).getDate();
          recomendacaoPrazoMinimo = diasRestantesMesAtual + diasMes1 + 2;
          regraMasterMensagem = `⚠️ REGRA MASTER ATIVA: O orçamento de ${mes0.nomeMes} (Limite R$ ${mes0.limite.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} • Boletos R$ ${mes0.totalComprometido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) está ESTOURADO em R$ ${Math.abs(mes0.saldoLivre).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, e ${mes1.nomeMes} também está acima do teto em R$ ${Math.abs(mes1.saldoLivre).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Priorize faturar para ${mes2.nomeMes} (Saldo livre: R$ ${mes2.saldoLivre.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`;
        } else {
          recomendacaoPrazoMinimo = diasRestantesMesAtual + 2;
          regraMasterMensagem = `⚠️ REGRA MASTER ATIVA: O orçamento de ${mes0.nomeMes} está ESTOURADO em R$ ${Math.abs(mes0.saldoLivre).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (Boletos: R$ ${mes0.totalComprometido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / Teto: R$ ${mes0.limite.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}). Exigir prazo mínimo de ${recomendacaoPrazoMinimo} dias para faturar em ${mes1.nomeMes} (Saldo disponível: R$ ${mes1.saldoLivre.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`;
        }
      } else if (mes0.statusOrcamento === 'ALERTA') {
        regraMasterMensagem = `⚠️ ATENÇÃO AO ORÇAMENTO: Restam R$ ${mes0.saldoLivre.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} disponíveis em ${mes0.nomeMes} (${mes0.percentualComprometido}% utilizado). Priorize prazos estendidos (28 a 42 dias).`;
      } else {
        regraMasterMensagem = `✅ ORÇAMENTO EQUILIBRADO: Saldo disponível de R$ ${mes0.saldoLivre.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em ${mes0.nomeMes} (Boletos: R$ ${mes0.totalComprometido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} / Limite: R$ ${mes0.limite.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`;
      }

      res.json({
        success: true,
        ano: anoAtual,
        regraMaster: {
          bloquearVencimentosMesAtual: mes0.statusOrcamento === 'ESTOURADO',
          prazoMinimoRecomendadoDias: recomendacaoPrazoMinimo,
          mensagem: regraMasterMensagem
        },
        mesAtual: mes0,
        proximoMes: mes1,
        mesSeguinte: mes2,
        semanaAtual: mes0.semanaAtual,
        todosMesesAno
      });
    } catch (err) {
      console.error('[BelaPed] Erro em orcamento-boletos:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/belaped/portais
   * Retorna os portais de distribuidoras cadastrados
   */
  router.get('/portais', (req, res) => {
    try {
      const portais = db.prepare(`SELECT * FROM belaped_portais ORDER BY is_ativo DESC, nome ASC`).all();
      res.json({ success: true, portais });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/belaped/portais
   * Cria ou edita um portal de distribuidora
   */
  router.post('/portais', (req, res) => {
    try {
      const { id, nome, url_portal, usuario, senha_enc, pedido_minimo, prazo_dias_padrao, uf_origem, is_ativo, observacoes } = req.body;

      if (!nome || !url_portal) {
        return res.status(400).json({ success: false, error: 'Nome e URL do portal são obrigatórios.' });
      }

      const portalId = id || crypto.randomUUID();
      const isMg = (uf_origem || 'MG').toUpperCase() === 'MG' ? 1 : 0;

      const existing = db.prepare('SELECT id FROM belaped_portais WHERE id = ?').get(portalId);

      if (existing) {
        db.prepare(`
          UPDATE belaped_portais
          SET nome = ?, url_portal = ?, usuario = ?, senha_enc = COALESCE(?, senha_enc),
              pedido_minimo = ?, prazo_dias_padrao = ?, uf_origem = ?, is_mg = ?, is_ativo = ?, observacoes = ?
          WHERE id = ?
        `).run(
          nome.toUpperCase().trim(),
          url_portal.trim(),
          usuario || '',
          senha_enc || null,
          Number(pedido_minimo) || 350.0,
          Number(prazo_dias_padrao) || 28,
          (uf_origem || 'MG').toUpperCase().trim(),
          isMg,
          is_ativo !== undefined ? (is_ativo ? 1 : 0) : 1,
          observacoes || '',
          portalId
        );
      } else {
        db.prepare(`
          INSERT INTO belaped_portais (id, nome, url_portal, usuario, senha_enc, pedido_minimo, prazo_dias_padrao, uf_origem, is_mg, is_ativo, observacoes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          portalId,
          nome.toUpperCase().trim(),
          url_portal.trim(),
          usuario || '',
          senha_enc || '',
          Number(pedido_minimo) || 350.0,
          Number(prazo_dias_padrao) || 28,
          (uf_origem || 'MG').toUpperCase().trim(),
          isMg,
          is_ativo !== undefined ? (is_ativo ? 1 : 0) : 1,
          observacoes || ''
        );
      }

      res.json({ success: true, id: portalId, message: 'Portal salvo com sucesso!' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/belaped/simular-otimizacao
   * Executa a otimização matemática de compras considerando:
   * 1. Menor preço líquido
   * 2. Pedido mínimo de cada distribuidora
   * 3. Reagrupamento inteligente de itens para atingir o mínimo
   * 4. Alerta de ICMS/DIFAL para distribuidoras fora de MG
   * 5. Análise de prazo do boleto e compatibilidade com o orçamento
   */
  router.post('/simular-otimizacao', (req, res) => {
    try {
      const { itens, cotacoesPorDistribuidora } = req.body;

      if (!itens || !Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ success: false, error: 'Lista de itens vazia para simulação.' });
      }

      const portais = db.prepare('SELECT * FROM belaped_portais WHERE is_ativo = 1').all();
      const portaisMap = {};
      portais.forEach(p => {
        portaisMap[p.nome.toUpperCase()] = p;
      });

      // Passo 1: Descobrir o menor preço e ranking de cada item
      const itensComRanking = itens.map(item => {
        const precosItem = (cotacoesPorDistribuidora && cotacoesPorDistribuidora[item.ean || item.produto_id]) || [];

        // Ordena por menor preço líquido
        const ordenados = precosItem.filter(p => p.preco > 0).sort((a, b) => a.preco - b.preco);
        const melhor = ordenados[0] || null;
        const segundo = ordenados[1] || null;

        return {
          ...item,
          melhorPreco: melhor ? melhor.preco : item.custo_unitario,
          melhorDistribuidora: melhor ? melhor.distribuidora : (item.fornecedor_ult_compra || 'A DEFINIR'),
          segundoPreco: segundo ? segundo.preco : null,
          segundaDistribuidora: segundo ? segundo.distribuidora : null,
          todasOpcoes: ordenados
        };
      });

      // Passo 2: Agrupar itens por distribuidora vencedora
      const carrinhosPorDistribuidora = {};

      itensComRanking.forEach(item => {
        const dist = (item.melhorDistribuidora || 'OUTROS').toUpperCase();
        if (!carrinhosPorDistribuidora[dist]) {
          const configPortal = portaisMap[dist] || {
            pedido_minimo: 350.0,
            prazo_dias_padrao: 28,
            is_mg: 1,
            uf_origem: 'MG'
          };

          carrinhosPorDistribuidora[dist] = {
            distribuidora: dist,
            pedidoMinimo: configPortal.pedido_minimo,
            prazoDias: configPortal.prazo_dias_padrao,
            isMg: Boolean(configPortal.is_mg),
            uf: configPortal.uf_origem,
            itens: [],
            total: 0,
            atingiuMinimo: false,
            faltaParaMinimo: 0,
            alertaTributario: !configPortal.is_mg ? '⚠️ Fora de MG (Incidência de ICMS-ST / DIFAL)' : null
          };
        }

        const qtd = Number(item.qtd_sugerida_7d) || 1;
        const subtotal = Number((qtd * item.melhorPreco).toFixed(2));

        carrinhosPorDistribuidora[dist].itens.push({
          ...item,
          quantidade: qtd,
          precoUnitario: item.melhorPreco,
          subtotal
        });
        carrinhosPorDistribuidora[dist].total += subtotal;
      });

      // Passo 3: Avaliar Pedido Mínimo e Reagrupamento Inteligente
      const carrinhosFinais = [];
      const sugestoesReagrupamento = [];

      Object.values(carrinhosPorDistribuidora).forEach(carrinho => {
        carrinho.total = Number(carrinho.total.toFixed(2));
        if (carrinho.total >= carrinho.pedidoMinimo) {
          carrinho.atingiuMinimo = true;
          carrinho.faltaParaMinimo = 0;
        } else {
          carrinho.atingiuMinimo = false;
          carrinho.faltaParaMinimo = Number((carrinho.pedidoMinimo - carrinho.total).toFixed(2));

          sugestoesReagrupamento.push({
            distribuidora: carrinho.distribuidora,
            valorAtual: carrinho.total,
            pedidoMinimo: carrinho.pedidoMinimo,
            falta: carrinho.faltaParaMinimo,
            sugestao: `Faltam R$ ${carrinho.faltaParaMinimo.toFixed(2)} para atingir o pedido mínimo. Sugestão: realocar itens ou completar com medicamentos Curva A de alto giro para garantir frete grátis.`
          });
        }
        carrinhosFinais.push(carrinho);
      });

      // Passo 4: Total consolidado do pedido simulado
      const totalGeral = carrinhosFinais.reduce((acc, c) => acc + c.total, 0);

      res.json({
        success: true,
        resumo: {
          totalGeral: Number(totalGeral.toFixed(2)),
          totalDistribuidores: carrinhosFinais.length,
          distribuidoresQueAtingiramMinimo: carrinhosFinais.filter(c => c.atingiuMinimo).length,
          distribuidoresAbaixoDoMinimo: carrinhosFinais.filter(c => !c.atingiuMinimo).length
        },
        carrinhos: carrinhosFinais,
        sugestoesReagrupamento
      });
    } catch (err) {
      console.error('[BelaPed] Erro em simular-otimizacao:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/belaped/relatorio-precos
   * Relatório de inteligência com alta e baixa de preços vs. notas fiscais anteriores
   */
  router.get('/relatorio-precos', (req, res) => {
    try {
      // Analisa o cache das últimas compras do Digifarma
      const produtos = db.prepare(`
        SELECT 
          c.produto_id,
          c.descricao,
          c.ean,
          c.curva_abc,
          c.preco_unitario_ult_compra,
          c.custo_unitario,
          c.preco_venda_vigente,
          c.ultima_compra_fornecedor,
          c.ultima_compra_data,
          c.vmd_ponderado,
          c.saldo
        FROM compras_estoque_cache c
        WHERE c.preco_unitario_ult_compra > 0
          AND c.curva_abc IN ('A', 'B')
        ORDER BY c.vmd_ponderado DESC
        LIMIT 60
      `).all();

      const formatados = produtos.map(p => {
        const custoUltCompra = Number(p.preco_unitario_ult_compra) || 0;
        const precoVenda = Number(p.preco_venda_vigente) || 0;
        const vmd = Number(p.vmd_ponderado) || 0;
        const saldo = Number(p.saldo) || 0;

        const margemBruta = precoVenda > 0 && custoUltCompra > 0
          ? Number((((precoVenda - custoUltCompra) / precoVenda) * 100).toFixed(1))
          : 0;

        return {
          produto_id: p.produto_id,
          descricao: p.descricao,
          ean: p.ean,
          curva_abc: p.curva_abc,
          custo_ult_compra: custoUltCompra,
          preco_venda: precoVenda,
          margem_bruta_percentual: margemBruta,
          fornecedor: p.ultima_compra_fornecedor || 'Cadastro Geral',
          data_compra: p.ultima_compra_data,
          vmd_diario: vmd,
          saldo_atual: saldo,
          dias_cobertura: vmd > 0 && saldo > 0 ? Math.round(saldo / vmd) : 0
        };
      });

      res.json({
        success: true,
        total: formatados.length,
        produtos: formatados
      });
    } catch (err) {
      console.error('[BelaPed] Erro em relatorio-precos:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/belaped/cotar-ao-vivo
   * Dispara o robô Puppeteer para cotar EANs reais diretamente no portal da distribuidora (Profarma)
   */
  /**
   * Função interna para execução de cotações ao vivo (acionada via API ou Agendador Automático)
   */
  const executarCotacaoAoVivoInternal = async (fornecedor = 'TODOS', limite = 40, eans = null, prioridadeFiltro = null) => {
    if (cotacaoStatus.emAndamento) {
      console.log('[BelaPed Cotação] Ignorando novo disparo: cotação já em andamento.');
      return false;
    }

    // Mapa de descrições e último custo de compra por EAN do cache de estoque
    const mapaDescricoes = {};
    const mapaUltimoCusto = {};
    const todosCache = db.prepare(`
      SELECT ean, descricao, saldo, vmd_ponderado, curva_abc, status_ruptura, preco_venda_vigente, preco_unitario_ult_compra, custo_unitario, vendas_30d, est_minimo_calculado
      FROM compras_estoque_cache
      WHERE ean IS NOT NULL AND length(ean) >= 7
    `).all();
    for (const c of todosCache) {
      if (c.ean) {
        const eanFormatado = String(c.ean).trim();
        mapaDescricoes[eanFormatado] = c.descricao || '';
        const custoRef = Number(c.preco_unitario_ult_compra) || Number(c.custo_unitario) || 0;
        if (custoRef > 0) mapaUltimoCusto[eanFormatado] = custoRef;
      }
    }

    // EANs que já possuem preço válido cotado nas últimas 24 horas (Validade Diária Dinâmica)
    const eansComPrecoHoje = new Set(
      db.prepare(`
        SELECT DISTINCT ean FROM belaped_cotacoes_reais 
        WHERE disponivel = 1 AND preco > 0 
          AND updated_at >= datetime('now', '-24 hours')
      `).all().map(r => r.ean)
    );

    let listaEans = [];
    const limiteEfetivo = Math.max(1, Number(limite) || 40);

    // Classificação por Prioridade Operacional (P1, P2, P3, P4)
    const p1List = [];
    const p2List = [];
    const p3List = [];
    const p4List = [];

    const mapaPrioridadeEan = {};
    for (const p of todosCache) {
      const ean = String(p.ean).trim();
      const saldo = Number(p.saldo) || 0;
      const vmd = Number(p.vmd_ponderado) || 0;
      const curva = p.curva_abc || 'C';
      const isCurvaAlta = curva === 'A' || curva === 'B';
      const diasCob = vmd > 0 ? (saldo / vmd) : 999;
      const vendas30 = Number(p.vendas_30d) || 0;
      const estMin = Number(p.est_minimo_calculado) || 0;

      let prio = 'P4';
      if (saldo <= 0 && isCurvaAlta) {
        prio = 'P1';
      } else if (saldo <= 0 && !isCurvaAlta) {
        prio = vendas30 > 0 ? 'P2' : 'P4';
      } else if (isCurvaAlta && (diasCob <= 3 || saldo <= Math.max(1, vmd * 3))) {
        prio = 'P2';
      } else if (saldo < estMin && (isCurvaAlta || vendas30 > 0)) {
        prio = 'P3';
      } else {
        prio = 'P4';
      }
      mapaPrioridadeEan[ean] = prio;

      // Só entra na fila pendente se estiver em falta/ruptura E NÃO tiver sido cotado nas últimas 24h
      if ((saldo <= 0 || saldo < estMin) && !eansComPrecoHoje.has(ean)) {
        if (prio === 'P1') p1List.push(ean);
        else if (prio === 'P2') p2List.push(ean);
        else if (prio === 'P3') p3List.push(ean);
        else p4List.push(ean);
      }
    }

    if (Array.isArray(eans) && eans.length > 0) {
      const filtrados = eans.map(e => String(e || '').trim()).filter(e => e.length >= 7);
      // Prioriza os que ainda não têm preço cotado hoje, mantendo a ordem estrita da página
      const semPrecoHoje = filtrados.filter(e => !eansComPrecoHoje.has(e));
      const comPrecoHoje = filtrados.filter(e => eansComPrecoHoje.has(e));

      // Ordena os sem preço pela Matriz de Gravidade Operacional
      const pesoPrio = { P1: 1, P2: 2, P3: 3, P4: 4 };
      semPrecoHoje.sort((a, b) => (pesoPrio[mapaPrioridadeEan[a] || 'P4'] - pesoPrio[mapaPrioridadeEan[b] || 'P4']));

      listaEans = [...semPrecoHoje, ...comPrecoHoje].slice(0, limiteEfetivo);
    } else {
      // Corte Inteligente: Se houver produtos em P1, P2 ou P3, não gasta esforço do robô com P4!
      let filaPrioritaria = [];
      if (prioridadeFiltro === 'P1') {
        filaPrioritaria = p1List;
      } else if (prioridadeFiltro === 'P2') {
        filaPrioritaria = p2List;
      } else if (prioridadeFiltro === 'P3') {
        filaPrioritaria = p3List;
      } else {
        filaPrioritaria = [...p1List, ...p2List, ...p3List];
        if (filaPrioritaria.length === 0) {
          filaPrioritaria = p4List; // P4 só é cotado quando a prioridade crítica estiver 100% zerada!
        }
      }
      listaEans = filaPrioritaria.slice(0, limiteEfetivo);
    }

    if (listaEans.length === 0) {
      console.log('[BelaPed Cotação] Todos os produtos prioritários já possuem cotação válida das últimas 24h.');
      return false;
    }

    // Identifica qual o foco de prioridade do lote atual
    let rotuloFoco = '🚨 P1: Ruptura Crítica';
    if (p1List.length === 0 && p2List.length > 0) rotuloFoco = '⚠️ P2: Risco Iminente';
    else if (p1List.length === 0 && p2List.length === 0 && p3List.length > 0) rotuloFoco = '💼 P3: Orçamento Semanal';
    else if (p1List.length === 0 && p2List.length === 0 && p3List.length === 0) rotuloFoco = '📦 P4: Regular';

    const numWorkers = fornecedor === 'TODOS' ? 6 : 1;
    let passosConcluidos = 0;

    // Inicializa status com telemetria de prioridade
    cotacaoStatus.emAndamento = true;
    cotacaoStatus.fornecedor = fornecedor;
    cotacaoStatus.prioridadeAtiva = rotuloFoco;
    cotacaoStatus.metricasPrioridades = {
      p1: p1List.length,
      p2: p2List.length,
      p3: p3List.length,
      p4: p4List.length,
      totalPendentes: p1List.length + p2List.length + p3List.length + p4List.length
    };
    cotacaoStatus.total = listaEans.length;
    cotacaoStatus.atual = 0;
    cotacaoStatus.encontrados = 0;
    cotacaoStatus.iniciadoEm = new Date().toISOString();
    cotacaoStatus.finalizadoEm = null;
    cotacaoStatus.log = [];

    // Executa os robôs em segundo plano (em paralelo quando fornecedor === 'TODOS')
    (async () => {
      const stmtSalvar = db.prepare(`
        INSERT INTO belaped_cotacoes_reais (ean, fornecedor, preco, disponivel, descricao, desc_pct, url_produto, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(ean, fornecedor) DO UPDATE SET
          preco = excluded.preco,
          disponivel = excluded.disponivel,
          descricao = excluded.descricao,
          desc_pct = excluded.desc_pct,
          url_produto = COALESCE(excluded.url_produto, belaped_cotacoes_reais.url_produto),
          updated_at = excluded.updated_at
      `);

      // Inicializa status detalhado por portal para o Mini-Monitor no canto inferior direito
      cotacaoStatus.workers = {
        'PROFARMA': { status: 'AGUARDANDO', itemAtual: 'Aguardando fila...', avaliados: 0, encontrados: 0, semEstoque: 0 },
        'DPC DISTRIBUIDORA': { status: 'AGUARDANDO', itemAtual: 'Aguardando fila...', avaliados: 0, encontrados: 0, semEstoque: 0 },
        'SOTON FARMA': { status: 'AGUARDANDO', itemAtual: 'Aguardando fila...', avaliados: 0, encontrados: 0, semEstoque: 0 },
        'DISTRIMED': { status: 'AGUARDANDO', itemAtual: 'Aguardando fila...', avaliados: 0, encontrados: 0, semEstoque: 0 },
        'DIVIMED': { status: 'AGUARDANDO', itemAtual: 'Aguardando fila...', avaliados: 0, encontrados: 0, semEstoque: 0 },
        'MARTINS ATACADO': { status: 'AGUARDANDO', itemAtual: 'Aguardando fila...', avaliados: 0, encontrados: 0, semEstoque: 0 }
      };

      const executarRoboParaFornecedor = async (nomeFornecedor, RobotClass) => {
        let robot = null;
        if (!cotacaoStatus.workers[nomeFornecedor]) {
          cotacaoStatus.workers[nomeFornecedor] = { status: 'INICIANDO', itemAtual: 'Iniciando navegador...', avaliados: 0, encontrados: 0, semEstoque: 0 };
        }
        try {
          console.log(`[BelaPed Cotação] Iniciando robô para ${nomeFornecedor}...`);
          cotacaoStatus.workers[nomeFornecedor].status = 'AUTENTICANDO';
          cotacaoStatus.workers[nomeFornecedor].itemAtual = 'Autenticando no portal B2B...';
          cotacaoStatus.ultimoItem = `${nomeFornecedor}: Autenticando no portal...`;

          robot = new RobotClass({ headless: true });
          await robot.iniciar();

          cotacaoStatus.workers[nomeFornecedor].status = 'COTANDO';

          for (let i = 0; i < listaEans.length; i++) {
            if (cotacaoStatus.solicitouParar) {
              console.log(`[BelaPed Cotação] ⛔ Interrupção solicitada para ${nomeFornecedor}. Finalizando robô.`);
              cotacaoStatus.workers[nomeFornecedor].status = 'INTERROMPIDO';
              cotacaoStatus.workers[nomeFornecedor].itemAtual = 'Interrompido a pedido do usuário';
              break;
            }

            const eanAtual = listaEans[i];
            const descAtual = mapaDescricoes[eanAtual] || '';
            cotacaoStatus.workers[nomeFornecedor].itemAtual = `Pesquisando: ${descAtual || eanAtual} (${i + 1}/${listaEans.length})`;
            cotacaoStatus.ultimoItem = `${nomeFornecedor}: ${descAtual || eanAtual}`;

            let resultado = await robot.cotarEAN(eanAtual, descAtual);

            // Double-Check Automático: se houver diferença muito grande entre o último custo de compra e o preço cotado
            const ultCustoRef = mapaUltimoCusto[eanAtual] || 0;
            if (resultado.disponivel && resultado.preco > 0 && ultCustoRef > 0) {
              const diffPct = ((resultado.preco - ultCustoRef) / ultCustoRef) * 100;
              // Queda >= 40% (suspeita de fracionamento ou erro de leitura) ou aumento >= 60%
              if (diffPct <= -40 || diffPct >= 60) {
                console.warn(`[BelaPed Double-Check] ⚠️ Divergência alta de ${diffPct.toFixed(1)}% detectada em ${nomeFornecedor} para "${descAtual || eanAtual}" (Últ. Compra R$ ${ultCustoRef.toFixed(2)} vs Cotado R$ ${resultado.preco.toFixed(2)}). Rodando robô novamente no produto para confirmação...`);
                cotacaoStatus.workers[nomeFornecedor].itemAtual = `🔄 Double-check (${diffPct > 0 ? '+' : ''}${diffPct.toFixed(0)}% vs últ. compra): ${descAtual || eanAtual}`;
                cotacaoStatus.ultimoItem = `🔄 Double-check ${nomeFornecedor}: ${descAtual || eanAtual}`;

                await new Promise(r => setTimeout(r, 1800));
                const segTentativa = await robot.cotarEAN(eanAtual, descAtual);
                if (segTentativa.disponivel && segTentativa.preco > 0) {
                  console.log(`[BelaPed Double-Check] ✅ Produto re-cotado com sucesso: R$ ${segTentativa.preco.toFixed(2)} (1ª: R$ ${resultado.preco.toFixed(2)})`);
                  resultado = segTentativa;
                } else {
                  console.warn(`[BelaPed Double-Check] ❌ Produto não confirmado na 2ª tentativa do robô. Descartando valor suspeito.`);
                  resultado = { disponivel: false, preco: null, mensagem: 'Divergência não confirmada no reteste do robô' };
                }
              }
            }

            // 🛡️ TRAVAS DE SEGURANÇA MÁSTER DO BELAPED:
            if (resultado.disponivel && resultado.preco > 0) {
              // Trava 1: Preço irreal de centavos (< R$ 0,35)
              if (resultado.preco < 0.35) {
                console.warn(`[BelaPed Segurança] ⛔ Preço irreal (< R$ 0,35): R$ ${resultado.preco.toFixed(2)} descartado para "${descAtual || eanAtual}".`);
                resultado = { disponivel: false, preco: null, mensagem: 'Descartado: Preço irreal (< R$ 0,35)' };
              }
              // Trava 2: Queda absurda (> 70% de desconto) em relação ao custo histórico para itens acima de R$ 3,00
              else if (ultCustoRef >= 3.0 && (resultado.preco / ultCustoRef) < 0.30) {
                console.warn(`[BelaPed Segurança] ⛔ Queda absurda (> 70%): R$ ${resultado.preco.toFixed(2)} vs Custo R$ ${ultCustoRef.toFixed(2)} para "${descAtual || eanAtual}". Descartado.`);
                resultado = { disponivel: false, preco: null, mensagem: 'Descartado: Variação absurda (> 70% de desconto vs custo)' };
              }
            }

            passosConcluidos++;
            cotacaoStatus.workers[nomeFornecedor].avaliados++;
            cotacaoStatus.atual = Math.min(listaEans.length, Math.max(1, Math.ceil(passosConcluidos / numWorkers)));

            const horaLog = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            if (resultado.disponivel && resultado.preco > 0) {
              cotacaoStatus.encontrados++;
              cotacaoStatus.workers[nomeFornecedor].encontrados++;
              cotacaoStatus.workers[nomeFornecedor].itemAtual = `✅ ${descAtual || eanAtual} -> R$ ${resultado.preco.toFixed(2)}`;
              cotacaoStatus.ultimoItem = `✅ ${nomeFornecedor}: ${descAtual || eanAtual} -> R$ ${resultado.preco.toFixed(2)}`;
              stmtSalvar.run(
                eanAtual,
                nomeFornecedor,
                resultado.preco,
                1,
                resultado.descricao || descAtual,
                resultado.descPct || 0,
                resultado.url || resultado.urlProduto || resultado.link || null
              );

              // Grava na série histórica temporal para Inteligência de Mercado (Melhor Dia e Gráfico)
              try {
                const hoje = new Date();
                const dataColeta = hoje.toISOString().split('T')[0];
                const diaSemana = hoje.getDay(); // 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sab
                const diaMes = hoje.getDate();
                const quinzena = diaMes <= 15 ? 1 : 2;

                // Evita duplicatas da mesma distribuidora no mesmo dia para manter o menor preço do dia
                const existeHoje = db.prepare(`
                  SELECT id, preco FROM belaped_precos_historico_diario
                  WHERE ean = ? AND fornecedor = ? AND data_coleta = ?
                `).get(eanAtual, nomeFornecedor, dataColeta);

                if (!existeHoje) {
                  db.prepare(`
                    INSERT INTO belaped_precos_historico_diario (ean, fornecedor, preco, descricao, dia_semana, dia_mes, quinzena, data_coleta)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                  `).run(eanAtual, nomeFornecedor, resultado.preco, resultado.descricao || descAtual, diaSemana, diaMes, quinzena, dataColeta);
                } else if (resultado.preco < existeHoje.preco) {
                  db.prepare(`
                    UPDATE belaped_precos_historico_diario
                    SET preco = ? WHERE id = ?
                  `).run(resultado.preco, existeHoje.id);
                }
              } catch (histErr) {
                console.error('[BelaPed] Erro ao registrar histórico temporal de preço:', histErr.message);
              }

              cotacaoStatus.log.push({
                hora: horaLog,
                fornecedor: nomeFornecedor,
                ean: eanAtual,
                status: 'OK',
                preco: resultado.preco,
                descricao: resultado.descricao || descAtual
              });
            } else {
              cotacaoStatus.workers[nomeFornecedor].semEstoque++;
              cotacaoStatus.workers[nomeFornecedor].itemAtual = `⚪ Sem estoque: ${descAtual || eanAtual}`;
              stmtSalvar.run(
                eanAtual,
                nomeFornecedor,
                null,
                0,
                resultado.mensagem || 'Indisponível',
                0,
                null
              );
              cotacaoStatus.log.push({
                hora: horaLog,
                fornecedor: nomeFornecedor,
                ean: eanAtual,
                descricao: descAtual || eanAtual,
                status: 'INDISPONIVEL',
                motivo: resultado.mensagem || 'Sem estoque'
              });
            }
            if (cotacaoStatus.log.length > 80) {
              cotacaoStatus.log = cotacaoStatus.log.slice(-80);
            }
          }
          cotacaoStatus.workers[nomeFornecedor].status = 'CONCLUIDO';
          cotacaoStatus.workers[nomeFornecedor].itemAtual = 'Lote finalizado com sucesso';
        } catch (botErr) {
          console.error(`[BelaPed Cotação] Erro no robô ${nomeFornecedor}:`, botErr.message);
          cotacaoStatus.workers[nomeFornecedor].status = 'ERRO';
          cotacaoStatus.workers[nomeFornecedor].itemAtual = `Erro: ${botErr.message}`;
          cotacaoStatus.log.push({
            hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            fornecedor: nomeFornecedor,
            status: 'ERRO',
            erro: botErr.message
          });
        } finally {
          if (robot) await robot.fechar().catch(() => {});
        }
      };

      try {
        if (fornecedor === 'DPC') {
          await executarRoboParaFornecedor('DPC DISTRIBUIDORA', DpcRobot);
        } else if (fornecedor === 'SOTON') {
          await executarRoboParaFornecedor('SOTON FARMA', SotonRobot);
        } else if (fornecedor === 'DISTRIMED') {
          await executarRoboParaFornecedor('DISTRIMED', DistrimedRobot);
        } else if (fornecedor === 'DIVIMED') {
          await executarRoboParaFornecedor('DIVIMED', DivimedRobot);
        } else if (fornecedor === 'MARTINS') {
          await executarRoboParaFornecedor('MARTINS ATACADO', MartinsRobot);
        } else if (fornecedor === 'TODOS') {
          await Promise.all([
            executarRoboParaFornecedor('PROFARMA', ProfarmaRobot),
            executarRoboParaFornecedor('DPC DISTRIBUIDORA', DpcRobot),
            executarRoboParaFornecedor('SOTON FARMA', SotonRobot),
            executarRoboParaFornecedor('DISTRIMED', DistrimedRobot),
            executarRoboParaFornecedor('DIVIMED', DivimedRobot),
            executarRoboParaFornecedor('MARTINS ATACADO', MartinsRobot)
          ]);
        } else {
          await executarRoboParaFornecedor('PROFARMA', ProfarmaRobot);
        }
      } finally {
        cotacaoStatus.atual = listaEans.length;
        cotacaoStatus.emAndamento = false;
        cotacaoStatus.solicitouParar = false;
        cotacaoStatus.finalizadoEm = new Date().toISOString();
        console.log(`[BelaPed Cotação] Finalizada: ${cotacaoStatus.encontrados} preços reais capturados.`);
      }
    })();

    return true;
  };

  // =========================================================================
  // HORÁRIOS ESTRATÉGICOS DE COTAÇÃO AUTOMÁTICA (B2B FARMÁCIA)
  // O sistema cota nos horários de maior impacto comercial e encerra o lote,
  // mantendo o sistema 100% livre e rápido durante o atendimento do balcão.
  // 1. 06:30 - Matinal de Abertura (equipe chega às 08h com tudo cotado e pronto)
  // 2. 12:30 - Meio-Dia / Almoço (antes do corte de faturamento dos CDs: 14h-16h)
  // 3. 17:45 - Fim de Tarde / Noturno (fechamento comercial para entregas matinais)
  // =========================================================================
  const HORARIOS_ESTRATEGICOS = ['06:30', '12:30', '17:45'];
  let ultimoMinutoAgendado = '';

  async function verificarERodarCotacaoSegundoPlano(origem = 'BACKGROUND_WORKER') {
    try {
      if (cotacaoStatus.emAndamento) {
        console.log(`[BelaPed Background Worker] Cotação já em andamento. Aguardando.`);
        return;
      }

      console.log(`[BelaPed Background Worker] [${origem}] Disparando cotação estratégica para produtos prioritários...`);
      // Executa estritamente 1 lote direcionado aos produtos mais críticos (P1 e P2 em falta/ruptura)
      const iniciado = await executarCotacaoAoVivoInternal('TODOS', 40, undefined, 'TODAS_PRIORITARIAS');
      if (iniciado) {
        console.log(`[BelaPed Background Worker] Ciclo estratégico iniciado com sucesso para ${origem}.`);
      } else {
        console.log(`[BelaPed Background Worker] Todos os itens prioritários já possuem cotação recente (< 24h). Nenhuma ação necessária.`);
      }
    } catch (err) {
      console.error(`[BelaPed Background Worker] Erro no ciclo estratégico:`, err.message);
    }
  }

  // Checagem a cada 30 segundos se o relógio atingiu algum dos horários estratégicos
  setInterval(() => {
    try {
      const agora = new Date();
      const horaMinutoAtual = agora.toLocaleTimeString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      if (HORARIOS_ESTRATEGICOS.includes(horaMinutoAtual) && ultimoMinutoAgendado !== horaMinutoAtual) {
        ultimoMinutoAgendado = horaMinutoAtual;
        console.log(`[BelaPed Agendador] >>> HORÁRIO ESTRATÉGICO (${horaMinutoAtual}): Disparando cotação nos 6 portais! <<<`);
        verificarERodarCotacaoSegundoPlano(`HORARIO_ESTRATEGICO_${horaMinutoAtual}`);
      }
    } catch (schedErr) {
      console.error('[BelaPed Agendador] Erro no timer estratégico:', schedErr.message);
    }
  }, 30000);

  /**
   * POST /api/belaped/parar-cotacao
   * Interrompe imediatamente qualquer cotação em andamento nos robôs
   */
  router.post('/parar-cotacao', (req, res) => {
    try {
      if (!cotacaoStatus.emAndamento) {
        return res.json({ success: true, message: 'Nenhuma cotação em andamento no momento.' });
      }

      cotacaoStatus.solicitouParar = true;
      cotacaoStatus.ultimoItem = '⛔ Cotação interrompida pelo usuário.';
      console.log('[BelaPed Cotação] ⛔ Interrupção solicitada pelo usuário.');

      res.json({
        success: true,
        message: 'Interrupção solicitada aos robôs. O processo será finalizado com segurança.'
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/belaped/cotar-ao-vivo
   * Dispara cotação ao vivo imediatamente via interface
   */
  router.post('/cotar-ao-vivo', async (req, res) => {
    try {
      if (cotacaoStatus.emAndamento) {
        return res.status(409).json({
          success: false,
          error: 'Já existe uma cotação ao vivo em andamento no momento.',
          status: cotacaoStatus
        });
      }

      const { fornecedor = 'TODOS', limite = 40, eans, prioridade } = req.body;
      const iniciado = await executarCotacaoAoVivoInternal(fornecedor, limite, eans, prioridade);

      if (!iniciado) {
        return res.status(400).json({
          success: false,
          error: 'Nenhum EAN prioritário pendente para cotar ou cotação já em andamento.'
        });
      }

      res.json({
        success: true,
        message: `Robô disparado com sucesso para cotar na ${fornecedor}!`,
        status: cotacaoStatus
      });

    } catch (err) {
      cotacaoStatus.emAndamento = false;
      console.error('[BelaPed] Erro no endpoint cotar-ao-vivo:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/belaped/martins/validar-2fa
   * Conclui a validação de duas etapas do Martins e salva o perfil permanente
   */
  router.post('/martins/validar-2fa', async (req, res) => {
    try {
      const { codigo } = req.body;
      if (!codigo) {
        return res.status(400).json({ success: false, error: 'Código de verificação é obrigatório.' });
      }
      const martins = new MartinsRobot({ headless: true });
      await martins.iniciar();
      await martins.validarCodigo2FA(codigo);
      await martins.fechar();
      res.json({ success: true, message: 'Código 2FA do Martins validado com sucesso e sessão permanente salva!' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/belaped/recotar-produto
   * Re-executa o robô sob demanda para um único produto (EAN)
   * Útil para revalidar produtos com grande divergência de preço vs última compra
   */
  router.post('/recotar-produto', async (req, res) => {
    try {
      const { ean, fornecedor, descricao } = req.body;
      const eanLimpo = String(ean || '').trim();
      if (!eanLimpo) {
        return res.status(400).json({ success: false, error: 'EAN é obrigatório para re-cotação.' });
      }

      const MAPA_CLASSES = {
        'PROFARMA': ProfarmaRobot,
        'DPC DISTRIBUIDORA': DpcRobot,
        'DPC': DpcRobot,
        'SOTON FARMA': SotonRobot,
        'SOTON': SotonRobot,
        'DISTRIMED': DistrimedRobot,
        'DIVIMED': DivimedRobot,
        'MARTINS ATACADO': MartinsRobot,
        'MARTINS': MartinsRobot
      };

      // Determina qual distribuidora rodar
      let fornecedorAlvo = fornecedor ? String(fornecedor).trim().toUpperCase() : null;
      if (!fornecedorAlvo || fornecedorAlvo === 'TODOS' || !MAPA_CLASSES[fornecedorAlvo]) {
        const melhorAtual = db.prepare(`
          SELECT fornecedor FROM belaped_cotacoes_reais
          WHERE ean = ? AND disponivel = 1 AND preco > 0
          ORDER BY preco ASC LIMIT 1
        `).get(eanLimpo);
        if (melhorAtual && MAPA_CLASSES[melhorAtual.fornecedor.toUpperCase()]) {
          fornecedorAlvo = melhorAtual.fornecedor.toUpperCase();
        } else {
          fornecedorAlvo = 'DISTRIMED';
        }
      }

      const RobotClass = MAPA_CLASSES[fornecedorAlvo];
      if (!RobotClass) {
        return res.status(400).json({ success: false, error: `Robô para a distribuidora "${fornecedorAlvo}" não encontrado.` });
      }

      console.log(`[BelaPed Re-cotação] Rodando robô ${fornecedorAlvo} sob demanda para o EAN ${eanLimpo} (${descricao || ''})...`);
      const robot = new RobotClass({ headless: true });
      await robot.iniciar();

      try {
        const resultado = await robot.cotarEAN(eanLimpo, descricao || '');

        const stmtSalvar = db.prepare(`
          INSERT INTO belaped_cotacoes_reais (ean, fornecedor, preco, disponivel, descricao, desc_pct, url_produto, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(ean, fornecedor) DO UPDATE SET
            preco = excluded.preco,
            disponivel = excluded.disponivel,
            descricao = excluded.descricao,
            desc_pct = excluded.desc_pct,
            url_produto = COALESCE(excluded.url_produto, belaped_cotacoes_reais.url_produto),
            updated_at = excluded.updated_at
        `);

        if (resultado.disponivel && resultado.preco > 0) {
          stmtSalvar.run(
            eanLimpo,
            fornecedorAlvo,
            resultado.preco,
            1,
            resultado.descricao || descricao || '',
            resultado.descPct || 0,
            resultado.url || resultado.urlProduto || resultado.link || null
          );
        } else {
          stmtSalvar.run(
            eanLimpo,
            fornecedorAlvo,
            null,
            0,
            resultado.mensagem || 'Indisponível no reteste do robô',
            0,
            null
          );
        }

        res.json({
          success: true,
          fornecedor: fornecedorAlvo,
          ean: eanLimpo,
          resultado
        });
      } finally {
        await robot.fechar().catch(() => {});
      }

    } catch (err) {
      console.error('[BelaPed Re-cotação] Erro:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/belaped/status-cotacao
   * Retorna o progresso em tempo real da cotação ao vivo + métricas segmentadas da fila (P1, P2, P3, P4)
   */
  router.get('/status-cotacao', (req, res) => {
    let filaMetricas = {
      totalFaltasComEan: 0,
      jaCotados: 0,
      aguardandoRobo: 0,
      p1Aguardando: 0,
      p2Aguardando: 0,
      p3Aguardando: 0,
      p4Aguardando: 0,
      prioridadeSugerida: 'P1'
    };
    try {
      // EANs com cotação válida nas últimas 24 horas (Validade Diária Dinâmica)
      const eansCotadosHojeSet = new Set(
        db.prepare(`
          SELECT DISTINCT ean FROM belaped_cotacoes_reais
          WHERE disponivel = 1 AND preco > 0
            AND updated_at >= datetime('now', '-24 hours')
        `).all().map(r => r.ean)
      );

      const todasFaltas = db.prepare(`
        SELECT ean, saldo, vmd_ponderado, curva_abc, vendas_30d, est_minimo_calculado
        FROM compras_estoque_cache
        WHERE ean IS NOT NULL AND length(ean) >= 7
          AND (saldo <= 0 OR saldo < est_minimo_calculado)
      `).all();

      let p1 = 0;
      let p2 = 0;
      let p3 = 0;
      let p4 = 0;
      let total = todasFaltas.length;
      let cotados = 0;

      for (const p of todasFaltas) {
        const ean = String(p.ean).trim();
        const jaCotado = eansCotadosHojeSet.has(ean);
        if (jaCotado) {
          cotados++;
          continue; // Já cotado nas últimas 24h, não está aguardando na fila ativa
        }

        const saldo = Number(p.saldo) || 0;
        const vmd = Number(p.vmd_ponderado) || 0;
        const curva = p.curva_abc || 'C';
        const isCurvaAlta = curva === 'A' || curva === 'B';
        const diasCob = vmd > 0 ? (saldo / vmd) : 999;
        const vendas30 = Number(p.vendas_30d) || 0;
        const estMin = Number(p.est_minimo_calculado) || 0;

        if (saldo <= 0 && isCurvaAlta) {
          p1++;
        } else if (saldo <= 0 && !isCurvaAlta) {
          if (vendas30 > 0) p2++;
          else p4++;
        } else if (isCurvaAlta && (diasCob <= 3 || saldo <= Math.max(1, vmd * 3))) {
          p2++;
        } else if (saldo < estMin && (isCurvaAlta || vendas30 > 0)) {
          p3++;
        } else {
          p4++;
        }
      }

      const prioridadeSugerida = p1 > 0 ? 'P1' : (p2 > 0 ? 'P2' : (p3 > 0 ? 'P3' : 'P4'));

      filaMetricas = {
        totalFaltasComEan: total,
        jaCotados: cotados,
        aguardandoRobo: Math.max(0, total - cotados),
        p1Aguardando: p1,
        p2Aguardando: p2,
        p3Aguardando: p3,
        p4Aguardando: p4,
        prioridadeSugerida
      };
    } catch (e) {}

    res.json({
      success: true,
      status: {
        ...cotacaoStatus,
        prioridadeAtiva: cotacaoStatus.emAndamento
          ? (cotacaoStatus.prioridadeAtiva || '🚨 P1: Ruptura Crítica')
          : (filaMetricas.p1Aguardando > 0 ? '🚨 P1: Ruptura Crítica' : (filaMetricas.p2Aguardando > 0 ? '⚠️ P2: Risco Iminente' : (filaMetricas.p3Aguardando > 0 ? '💼 P3: Orçamento Semanal' : '📦 P4: Regular'))),
        fila: filaMetricas
      }
    });
  });

  /**
   * GET /api/belaped/historico-precos-produto?ean=...&produto_id=...
   * Retorna os pontos do gráfico temporal de preços capturados pelos robôs
   * e pelas notas fiscais reais do Digifarma.
   */
  router.get('/historico-precos-produto', (req, res) => {
    try {
      const { ean, produto_id } = req.query;
      if (!ean && !produto_id) {
        return res.status(400).json({ success: false, error: 'EAN ou produto_id é obrigatório.' });
      }

      const pontosHistorico = [];

      // 1. Pontos do histórico capturado diariamente pelos robôs nos portais
      if (ean) {
        const rowsRobo = db.prepare(`
          SELECT 
            fornecedor,
            preco,
            data_coleta,
            dia_semana,
            dia_mes
          FROM belaped_precos_historico_diario
          WHERE ean = ?
          ORDER BY data_coleta ASC
        `).all(String(ean).trim());

        rowsRobo.forEach(r => {
          pontosHistorico.push({
            data: r.data_coleta,
            fornecedor: r.fornecedor,
            preco: Number(r.preco),
            origem: 'ROBO_B2B',
            diaSemana: r.dia_semana
          });
        });
      }

      // 2. Pontos históricos de compras reais registradas no Digifarma (notas fiscais)
      if (ean || produto_id) {
        try {
          const rowsNf = db.prepare(`
            SELECT 
              data_compra as data,
              fornecedor,
              preco_unitario as preco
            FROM compras_itens_historico
            WHERE (ean = ? OR produto_id = ?) AND preco_unitario > 0
            ORDER BY data_compra ASC
          `).all(String(ean || '').trim(), Number(produto_id || 0));

          rowsNf.forEach(r => {
            if (r.data) {
              const dataClean = String(r.data).split('T')[0];
              const d = new Date(dataClean + 'T12:00:00');
              pontosHistorico.push({
                data: dataClean,
                fornecedor: r.fornecedor || 'Nota Fiscal (NF)',
                preco: Number(r.preco),
                origem: 'COMPRA_NF',
                diaSemana: isNaN(d.getTime()) ? 0 : d.getDay()
              });
            }
          });
        } catch (nfErr) {}
      }

      // 3. Se ainda tiver poucos pontos (ex: robô rodou hoje pela primeira vez), inclui a cotação real atual
      if (ean) {
        const atuais = db.prepare(`
          SELECT fornecedor, preco, updated_at
          FROM belaped_cotacoes_reais
          WHERE ean = ? AND disponivel = 1 AND preco > 0
        `).all(String(ean).trim());

        atuais.forEach(a => {
          const dStr = (a.updated_at || new Date().toISOString()).split('T')[0];
          const jaExiste = pontosHistorico.some(p => p.data === dStr && p.fornecedor === a.fornecedor);
          if (!jaExiste) {
            pontosHistorico.push({
              data: dStr,
              fornecedor: a.fornecedor,
              preco: Number(a.preco),
              origem: 'ROBO_B2B',
              diaSemana: new Date().getDay()
            });
          }
        });
      }

      // Ordena cronologicamente para exibição perfeita em linha temporal no Recharts
      pontosHistorico.sort((a, b) => a.data.localeCompare(b.data));

      // Calcula menor preço histórico, maior preço histórico e melhor dia da semana
      const DIAS_SEMANA_NOMES = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
      const mediasPorDia = {};

      pontosHistorico.forEach(p => {
        if (!mediasPorDia[p.diaSemana]) {
          mediasPorDia[p.diaSemana] = { soma: 0, count: 0, min: p.preco };
        }
        mediasPorDia[p.diaSemana].soma += p.preco;
        mediasPorDia[p.diaSemana].count += 1;
        if (p.preco < mediasPorDia[p.diaSemana].min) {
          mediasPorDia[p.diaSemana].min = p.preco;
        }
      });

      let melhorDiaSemanaIndex = 2; // Terça-feira por padrão de mercado distribuidor
      let menorMedia = Infinity;
      Object.keys(mediasPorDia).forEach(diaKey => {
        const dIdx = Number(diaKey);
        const media = mediasPorDia[dIdx].soma / mediasPorDia[dIdx].count;
        if (media < menorMedia) {
          menorMedia = media;
          melhorDiaSemanaIndex = dIdx;
        }
      });

      const precosValidos = pontosHistorico.map(p => p.preco).filter(pr => pr > 0);
      const menorPrecoHistorico = precosValidos.length > 0 ? Math.min(...precosValidos) : 0;
      const maiorPrecoHistorico = precosValidos.length > 0 ? Math.max(...precosValidos) : 0;

      res.json({
        success: true,
        ean,
        pontos: pontosHistorico,
        estatisticas: {
          totalColetas: pontosHistorico.length,
          menorPrecoHistorico,
          maiorPrecoHistorico,
          melhorDiaSemana: DIAS_SEMANA_NOMES[melhorDiaSemanaIndex],
          melhorDiaSemanaIndex,
          melhorQuinzena: '1ª Quinzena (Início do Mês)',
          dicaMercado: `Historicamente o menor preço deste item ocorre às ${DIAS_SEMANA_NOMES[melhorDiaSemanaIndex]}s nas distribuidoras.`
        }
      });
    } catch (err) {
      console.error('[BelaPed] Erro ao buscar histórico de preços:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/belaped/exportar-planilha-profarma
   * Gera e faz o download da planilha no formato exato da Profarma:
   * Colunas: Codigo/EAN;Quantidade
   */
  router.get('/exportar-planilha-profarma', (req, res) => {
    try {
      const produtos = db.prepare(`
        SELECT 
          c.ean,
          c.descricao,
          c.saldo,
          c.vmd_ponderado
        FROM compras_estoque_cache c
        WHERE c.ean IS NOT NULL AND length(c.ean) >= 7
          AND (c.saldo <= 0 OR c.saldo < c.est_minimo_calculado)
          AND c.curva_abc IN ('A', 'B')
        ORDER BY (c.saldo <= 0) DESC, c.vmd_ponderado DESC
        LIMIT 100
      `).all();

      let csvContent = 'Codigo/EAN;Quantidade\r\n';
      for (const p of produtos) {
        const vmd = Number(p.vmd_ponderado) || 0;
        const saldo = Number(p.saldo) || 0;
        const necessidade7d = Math.ceil(vmd * 7 * 1.15);
        let qtd = saldo <= 0 ? Math.max(1, Math.abs(saldo) + necessidade7d) : Math.max(1, necessidade7d - saldo);
        csvContent += `${p.ean};${qtd}\r\n`;
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="pedido_profarma_belaped.csv"');
      res.send(csvContent);
    } catch (err) {
      console.error('[BelaPed] Erro ao exportar planilha Profarma:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/belaped/exportar-planilha-dpc
   * Gera e faz o download da planilha no formato exato da DPC:
   * Colunas: codigo ou ean;quantidade
   */
  router.get('/exportar-planilha-dpc', (req, res) => {
    try {
      const produtos = db.prepare(`
        SELECT 
          c.ean,
          c.descricao,
          c.saldo,
          c.vmd_ponderado
        FROM compras_estoque_cache c
        WHERE c.ean IS NOT NULL AND length(c.ean) >= 7
          AND (c.saldo <= 0 OR c.saldo < c.est_minimo_calculado)
          AND c.curva_abc IN ('A', 'B')
        ORDER BY (c.saldo <= 0) DESC, c.vmd_ponderado DESC
        LIMIT 100
      `).all();

      // Layout exato DPC: "codigo ou ean;quantidade"
      let csvContent = 'codigo ou ean;quantidade\r\n';
      for (const p of produtos) {
        const vmd = Number(p.vmd_ponderado) || 0;
        const saldo = Number(p.saldo) || 0;
        const necessidade7d = Math.ceil(vmd * 7 * 1.15);
        let qtd = saldo <= 0 ? Math.max(1, Math.abs(saldo) + necessidade7d) : Math.max(1, necessidade7d - saldo);
        csvContent += `${p.ean};${qtd}\r\n`;
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="pedido_dpc_belaped.csv"');
      res.send(csvContent);
    } catch (err) {
      console.error('[BelaPed] Erro ao exportar planilha DPC:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BELAPED: GESTÃO E LIMPEZA ESTRITA DE CARRINHOS (REGRA MASTER DE SEGURANÇA)
  // Garante que todos os portais alvo estejam 100% vazios (0 itens) antes de qualquer montagem.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Garante com até 2 retentativas que um robô já iniciado tenha seu carrinho 100% limpo (0 itens).
   * Se persistir qualquer item após 2 retentativas, aborta lançando exceção para impedir compras não planejadas.
   */
  async function garantirCarrinhoVazioRobo(robot, nomePortal) {
    console.log(`[BelaPed Segurança] 🛡️ Verificando se carrinho da ${nomePortal.toUpperCase()} está limpo (0 itens)...`);
    let limpo = false;
    let ultimoErro = null;

    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      try {
        const qtd = await robot.contarItensCarrinho();
        if (qtd === 0) {
          console.log(`[BelaPed Segurança] ✅ ${nomePortal.toUpperCase()} confirmado com 0 itens.`);
          limpo = true;
          break;
        }

        console.log(`[BelaPed Segurança] 🧹 ${nomePortal.toUpperCase()} continha ${qtd} item(ns) residual(is). Executando limpeza (Tentativa ${tentativa}/3)...`);
        await robot.limparCarrinho();

        const qtdApos = await robot.contarItensCarrinho();
        if (qtdApos === 0) {
          console.log(`[BelaPed Segurança] ✅ ${nomePortal.toUpperCase()} esvaziado com sucesso (0 itens confirmados).`);
          limpo = true;
          break;
        } else {
          ultimoErro = new Error(`Carrinho permaneceu com ${qtdApos} item(ns) após tentativa de limpeza.`);
        }
      } catch (err) {
        ultimoErro = err;
        console.warn(`[BelaPed Segurança] Tentativa ${tentativa} falhou em ${nomePortal}: ${err.message}`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!limpo) {
      throw new Error(`ABORTADO POR SEGURANÇA: Não foi possível garantir o carrinho da ${nomePortal.toUpperCase()} com 0 itens (${ultimoErro?.message || 'itens residuais persistiram'}). Montagem cancelada.`);
    }
  }

  /**
   * Garante que múltiplos portais estejam confirmados com 0 itens antes da criação de pedidos.
   */
  async function garantirCarrinhosVazios(portaisAlvo = ['soton', 'divimed', 'distrimed', 'profarma', 'dpc', 'martins']) {
    console.log(`[BelaPed Segurança] 🛡️ Verificando e garantindo carrinhos limpos para: ${portaisAlvo.join(', ')}...`);
    const resultados = [];

    const instanciarRobo = (nome) => {
      switch (nome.toLowerCase()) {
        case 'soton': return new SotonRobot({ headless: true });
        case 'divimed': return new DivimedRobot({ headless: true });
        case 'distrimed': return new DistrimedRobot({ headless: true });
        case 'profarma': return new ProfarmaRobot({ headless: true });
        case 'dpc': return new DpcRobot({ headless: true });
        case 'martins': return new MartinsRobot({ headless: true });
        default: return null;
      }
    };

    for (const portal of portaisAlvo) {
      let robot = null;
      try {
        robot = instanciarRobo(portal);
        if (!robot) continue;
        await robot.iniciar();
        await garantirCarrinhoVazioRobo(robot, portal);
        resultados.push({ portal, sucesso: true, itens: 0 });
      } catch (err) {
        console.error(`[BelaPed Segurança] ❌ ABORTANDO: Falha crítica na limpeza do carrinho ${portal.toUpperCase()}:`, err.message);
        throw err;
      } finally {
        if (robot) await robot.fechar().catch(() => {});
      }
    }

    return resultados;
  }

  // Estado de montagem do carrinho na Soton
  const sotonCarrinhoStatus = {
    emAndamento: false,
    total: 0,
    atual: 0,
    sucessos: 0,
    erros: 0,
    ultimoItem: '',
    itens: []
  };

  /**
   * POST /api/belaped/montar-carrinho-soton
   * Inicia o robô Puppeteer para adicionar produto a produto no carrinho da Soton Farma
   */
  router.post('/montar-carrinho-soton', async (req, res) => {
    try {
      if (sotonCarrinhoStatus.emAndamento) {
        return res.status(400).json({
          success: false,
          message: 'Uma montagem de carrinho na Soton já está em andamento. Aguarde a conclusão.'
        });
      }

      let itensParaAdicionar = req.body.itens || [];

      // Se não passou lista explícita, seleciona os itens de ruptura onde Soton é o 1º colocado
      if (!Array.isArray(itensParaAdicionar) || itensParaAdicionar.length === 0) {
        const produtosGanhadores = db.prepare(`
          SELECT 
            c.ean,
            c.descricao,
            c.saldo,
            c.vmd_ponderado,
            cr.preco
          FROM compras_estoque_cache c
          JOIN belaped_cotacoes_reais cr ON cr.ean = c.ean AND cr.fornecedor = 'SOTON FARMA' AND cr.disponivel = 1
          WHERE c.ean IS NOT NULL AND length(c.ean) >= 7
            AND (c.saldo <= 0 OR c.saldo < c.est_minimo_calculado)
            AND c.curva_abc IN ('A', 'B')
          ORDER BY (c.saldo <= 0) DESC, c.vmd_ponderado DESC
          LIMIT 50
        `).all();

        itensParaAdicionar = produtosGanhadores.map(p => {
          const vmd = Number(p.vmd_ponderado) || 0;
          const saldo = Number(p.saldo) || 0;
          const necessidade7d = Math.ceil(vmd * 7 * 1.15);
          const qtd = saldo <= 0 ? Math.max(1, Math.abs(saldo) + necessidade7d) : Math.max(1, necessidade7d - saldo);
          return { ean: p.ean, quantidade: qtd, descricao: p.descricao };
        });
      }

      if (itensParaAdicionar.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Nenhum produto vencedor na Soton Farma para adicionar ao carrinho no momento.'
        });
      }

      sotonCarrinhoStatus.emAndamento = true;
      sotonCarrinhoStatus.total = itensParaAdicionar.length;
      sotonCarrinhoStatus.atual = 0;
      sotonCarrinhoStatus.sucessos = 0;
      sotonCarrinhoStatus.erros = 0;
      sotonCarrinhoStatus.ultimoItem = '';
      sotonCarrinhoStatus.itens = [];

      res.json({
        success: true,
        message: `Montagem de carrinho iniciada na Soton Farma com ${itensParaAdicionar.length} produtos.`,
        status: sotonCarrinhoStatus
      });

      // Executa adição em background
      (async () => {
        let robot = null;
        try {
          console.log('[BelaPed] Iniciando robô Soton para montagem de carrinho...');
          robot = new SotonRobot({ headless: true });
          await robot.iniciar();

          // 🛡️ REGRA CRÍTICA: Validação e esvaziamento prévio obrigatório
          sotonCarrinhoStatus.ultimoItem = 'Garantindo carrinho limpo com 0 itens...';
          await garantirCarrinhoVazioRobo(robot, 'soton');

          for (let i = 0; i < itensParaAdicionar.length; i++) {
            const item = itensParaAdicionar[i];
            sotonCarrinhoStatus.atual = i + 1;
            sotonCarrinhoStatus.ultimoItem = `${item.ean} (Qtd: ${item.quantidade})`;

            console.log(`[BelaPed Carrinho Soton] Adicionando EAN ${item.ean} - Qtd ${item.quantidade}...`);
            const resItem = await robot.adicionarAoCarrinho(item.ean, item.quantidade);

            if (resItem.sucesso) {
              sotonCarrinhoStatus.sucessos++;
              sotonCarrinhoStatus.itens.push({
                ean: item.ean,
                quantidade: item.quantidade,
                status: 'ADICIONADO'
              });
            } else {
              sotonCarrinhoStatus.erros++;
              sotonCarrinhoStatus.itens.push({
                ean: item.ean,
                quantidade: item.quantidade,
                status: 'FALHOU',
                motivo: resItem.motivo
              });
            }
          }
          console.log(`[BelaPed Carrinho Soton] Concluído: ${sotonCarrinhoStatus.sucessos} adicionados, ${sotonCarrinhoStatus.erros} falhas.`);
        } catch (botErr) {
          console.error('[BelaPed Carrinho Soton] Erro crítico no robô:', botErr.message);
        } finally {
          if (robot) await robot.fechar().catch(() => {});
          sotonCarrinhoStatus.emAndamento = false;
        }
      })();

    } catch (err) {
      sotonCarrinhoStatus.emAndamento = false;
      console.error('[BelaPed] Erro em montar-carrinho-soton:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/belaped/status-carrinho-soton
   */
  router.get('/status-carrinho-soton', (req, res) => {
    res.json({
      success: true,
      status: sotonCarrinhoStatus
    });
  });

  // Estado de montagem do carrinho na Divimed
  const divimedCarrinhoStatus = {
    emAndamento: false,
    total: 0,
    atual: 0,
    sucessos: 0,
    erros: 0,
    ultimoItem: '',
    itens: []
  };

  /**
   * POST /api/belaped/montar-carrinho-divimed
   * Inicia o robô Puppeteer para adicionar produto a produto no carrinho da Divimed
   */
  router.post('/montar-carrinho-divimed', async (req, res) => {
    try {
      if (divimedCarrinhoStatus.emAndamento) {
        return res.status(400).json({
          success: false,
          message: 'Uma montagem de carrinho na Divimed já está em andamento. Aguarde a conclusão.'
        });
      }

      let itensParaAdicionar = req.body.itens || [];

      // Se não passou lista explícita, seleciona os itens de ruptura onde Divimed é a vencedora
      if (!Array.isArray(itensParaAdicionar) || itensParaAdicionar.length === 0) {
        const produtosGanhadores = db.prepare(`
          SELECT 
            c.ean,
            c.descricao,
            c.saldo,
            c.vmd_ponderado,
            cr.preco
          FROM compras_estoque_cache c
          JOIN belaped_cotacoes_reais cr ON cr.ean = c.ean AND cr.fornecedor = 'DIVIMED' AND cr.disponivel = 1
          WHERE c.ean IS NOT NULL AND length(c.ean) >= 7
            AND (c.saldo <= 0 OR c.saldo < c.est_minimo_calculado)
            AND c.curva_abc IN ('A', 'B')
          ORDER BY (c.saldo <= 0) DESC, c.vmd_ponderado DESC
          LIMIT 50
        `).all();

        itensParaAdicionar = produtosGanhadores.map(p => {
          const vmd = Number(p.vmd_ponderado) || 0;
          const saldo = Number(p.saldo) || 0;
          const necessidade7d = Math.ceil(vmd * 7 * 1.15);
          const qtd = saldo <= 0 ? Math.max(1, Math.abs(saldo) + necessidade7d) : Math.max(1, necessidade7d - saldo);
          return { ean: p.ean, quantidade: qtd, descricao: p.descricao };
        });
      }

      if (itensParaAdicionar.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Nenhum produto vencedor na Divimed para adicionar ao carrinho no momento.'
        });
      }

      divimedCarrinhoStatus.emAndamento = true;
      divimedCarrinhoStatus.total = itensParaAdicionar.length;
      divimedCarrinhoStatus.atual = 0;
      divimedCarrinhoStatus.sucessos = 0;
      divimedCarrinhoStatus.erros = 0;
      divimedCarrinhoStatus.ultimoItem = '';
      divimedCarrinhoStatus.itens = [];

      res.json({
        success: true,
        message: `Montagem de carrinho iniciada na Divimed com ${itensParaAdicionar.length} produtos.`,
        status: divimedCarrinhoStatus
      });

      // Executa adição produto por produto em background
      (async () => {
        let robot = null;
        try {
          console.log('[BelaPed] Iniciando robô Divimed para montagem de carrinho...');
          robot = new DivimedRobot({ headless: true });
          await robot.iniciar();

          // 🛡️ REGRA CRÍTICA: Validação e esvaziamento prévio obrigatório
          divimedCarrinhoStatus.ultimoItem = 'Garantindo carrinho limpo com 0 itens...';
          await garantirCarrinhoVazioRobo(robot, 'divimed');

          for (let i = 0; i < itensParaAdicionar.length; i++) {
            const item = itensParaAdicionar[i];
            divimedCarrinhoStatus.atual = i + 1;
            divimedCarrinhoStatus.ultimoItem = `${item.descricao || item.ean} (Qtd: ${item.quantidade})`;

            console.log(`[BelaPed Carrinho Divimed] Adicionando ${item.descricao || item.ean} - Qtd ${item.quantidade}...`);
            const resItem = await robot.adicionarAoCarrinho(item.ean, item.quantidade, item.descricao);

            if (resItem.sucesso) {
              divimedCarrinhoStatus.sucessos++;
              divimedCarrinhoStatus.itens.push({
                ean: item.ean,
                descricao: item.descricao,
                quantidade: item.quantidade,
                status: 'ADICIONADO'
              });
            } else {
              divimedCarrinhoStatus.erros++;
              divimedCarrinhoStatus.itens.push({
                ean: item.ean,
                descricao: item.descricao,
                quantidade: item.quantidade,
                status: 'FALHOU',
                motivo: resItem.motivo
              });
            }
          }
          console.log(`[BelaPed Carrinho Divimed] Concluído: ${divimedCarrinhoStatus.sucessos} adicionados, ${divimedCarrinhoStatus.erros} falhas.`);
        } catch (botErr) {
          console.error('[BelaPed Carrinho Divimed] Erro crítico no robô:', botErr.message);
        } finally {
          if (robot) await robot.fechar().catch(() => {});
          divimedCarrinhoStatus.emAndamento = false;
        }
      })();

    } catch (err) {
      divimedCarrinhoStatus.emAndamento = false;
      console.error('[BelaPed] Erro em montar-carrinho-divimed:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/belaped/status-carrinho-divimed
   */
  router.get('/status-carrinho-divimed', (req, res) => {
    res.json({
      success: true,
      status: divimedCarrinhoStatus
    });
  });

  /**
   * GET /api/belaped/exportar-planilha-distrimed
   * Exporta arquivo no modelo aceito pela Modal da Distrimed (EAN;Quantidade)
   */
  router.get('/exportar-planilha-distrimed', (req, res) => {
    try {
      const produtos = db.prepare(`
        SELECT 
          c.ean,
          c.descricao,
          c.saldo,
          c.vmd_ponderado
        FROM compras_estoque_cache c
        WHERE c.ean IS NOT NULL AND length(c.ean) >= 7
          AND (c.saldo <= 0 OR c.saldo < c.est_minimo_calculado)
          AND c.curva_abc IN ('A', 'B')
        ORDER BY (c.saldo <= 0) DESC, c.vmd_ponderado DESC
        LIMIT 100
      `).all();

      let csvContent = 'EAN;Quantidade\r\n';
      for (const p of produtos) {
        const vmd = Number(p.vmd_ponderado) || 0;
        const saldo = Number(p.saldo) || 0;
        const necessidade7d = Math.ceil(vmd * 7 * 1.15);
        let qtd = saldo <= 0 ? Math.max(1, Math.abs(saldo) + necessidade7d) : Math.max(1, necessidade7d - saldo);
        csvContent += `${p.ean};${qtd}\r\n`;
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="pedido_distrimed_belaped.csv"');
      res.send(csvContent);
    } catch (err) {
      console.error('[BelaPed] Erro ao exportar planilha Distrimed:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Estado do robô de importação na modal da Distrimed
  const distrimedImportStatus = {
    emAndamento: false,
    mensagem: '',
    iniciadoEm: null,
    sucesso: false
  };

  /**
   * POST /api/belaped/importar-carrinho-distrimed
   * Robô executa o fluxo completo: login, clica em Importar, confirma condição de preço e anexa o arquivo na modal!
   */
  router.post('/importar-carrinho-distrimed', async (req, res) => {
    try {
      if (distrimedImportStatus.emAndamento) {
        return res.status(400).json({
          success: false,
          message: 'Uma importação na Distrimed já está em andamento.'
        });
      }

      distrimedImportStatus.emAndamento = true;
      distrimedImportStatus.mensagem = 'Iniciando robô Distrimed...';
      distrimedImportStatus.iniciadoEm = new Date().toISOString();
      distrimedImportStatus.sucesso = false;

      // Gera arquivo temporário no disco
      const tempPath = path.resolve(__dirname, 'pedido_temp_distrimed.csv');
      const produtos = db.prepare(`
        SELECT 
          c.ean,
          c.descricao,
          c.saldo,
          c.vmd_ponderado
        FROM compras_estoque_cache c
        WHERE c.ean IS NOT NULL AND length(c.ean) >= 7
          AND (c.saldo <= 0 OR c.saldo < c.est_minimo_calculado)
          AND c.curva_abc IN ('A', 'B')
        ORDER BY (c.saldo <= 0) DESC, c.vmd_ponderado DESC
        LIMIT 60
      `).all();

      let csvContent = 'EAN;Quantidade\r\n';
      for (const p of produtos) {
        const vmd = Number(p.vmd_ponderado) || 0;
        const saldo = Number(p.saldo) || 0;
        const necessidade7d = Math.ceil(vmd * 7 * 1.15);
        let qtd = saldo <= 0 ? Math.max(1, Math.abs(saldo) + necessidade7d) : Math.max(1, necessidade7d - saldo);
        csvContent += `${p.ean};${qtd}\r\n`;
      }
      fs.writeFileSync(tempPath, csvContent, 'utf-8');

      res.json({
        success: true,
        message: 'Robô Distrimed iniciado para realizar o upload automático na modal de carrinho!'
      });

      // Executa em background
      (async () => {
        let robot = null;
        try {
          robot = new DistrimedRobot({ headless: true });
          await robot.iniciar();

          // 🛡️ REGRA CRÍTICA: Validação e esvaziamento prévio obrigatório
          distrimedImportStatus.mensagem = 'Garantindo carrinho limpo com 0 itens...';
          await garantirCarrinhoVazioRobo(robot, 'distrimed');

          distrimedImportStatus.mensagem = 'Logado. Abrindo modal e anexando arquivo...';

          const resultado = await robot.importarCarrinhoArquivo(tempPath);
          distrimedImportStatus.sucesso = resultado.sucesso;
          distrimedImportStatus.mensagem = resultado.sucesso
            ? 'Pedido importado na modal da Distrimed com sucesso!'
            : (resultado.motivo || 'Erro ao importar na modal');
        } catch (botErr) {
          distrimedImportStatus.sucesso = false;
          distrimedImportStatus.mensagem = 'Erro no robô: ' + botErr.message;
        } finally {
          if (robot) await robot.fechar().catch(() => {});
          distrimedImportStatus.emAndamento = false;
          try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (e) {}
        }
      })();

    } catch (err) {
      distrimedImportStatus.emAndamento = false;
      console.error('[BelaPed] Erro em importar-carrinho-distrimed:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/belaped/status-carrinho-distrimed
   */
  router.get('/status-carrinho-distrimed', (req, res) => {
    res.json({
      success: true,
      status: distrimedImportStatus
    });
  });

  // Estado de montagem do carrinho na DPC
  const dpcCarrinhoStatus = {
    emAndamento: false,
    total: 0,
    atual: 0,
    sucessos: 0,
    erros: 0,
    ultimoItem: '',
    itens: []
  };

  /**
   * POST /api/belaped/montar-carrinho-dpc
   */
  router.post('/montar-carrinho-dpc', async (req, res) => {
    try {
      if (dpcCarrinhoStatus.emAndamento) {
        return res.status(400).json({ success: false, message: 'Montagem de carrinho na DPC já em andamento.' });
      }

      let itensParaAdicionar = req.body.itens || [];
      if (!Array.isArray(itensParaAdicionar) || itensParaAdicionar.length === 0) {
        const produtosGanhadores = db.prepare(`
          SELECT c.ean, c.descricao, c.saldo, c.vmd_ponderado, cr.preco
          FROM compras_estoque_cache c
          JOIN belaped_cotacoes_reais cr ON cr.ean = c.ean AND cr.fornecedor = 'DPC DISTRIBUIDORA' AND cr.disponivel = 1
          WHERE c.ean IS NOT NULL AND length(c.ean) >= 7
            AND (c.saldo <= 0 OR c.saldo < c.est_minimo_calculado)
            AND c.curva_abc IN ('A', 'B')
          ORDER BY (c.saldo <= 0) DESC, c.vmd_ponderado DESC
          LIMIT 50
        `).all();

        itensParaAdicionar = produtosGanhadores.map(p => {
          const vmd = Number(p.vmd_ponderado) || 0;
          const saldo = Number(p.saldo) || 0;
          const necessidade7d = Math.ceil(vmd * 7 * 1.15);
          const qtd = saldo <= 0 ? Math.max(1, Math.abs(saldo) + necessidade7d) : Math.max(1, necessidade7d - saldo);
          return { ean: p.ean, quantidade: qtd, descricao: p.descricao };
        });
      }

      if (itensParaAdicionar.length === 0) {
        return res.status(400).json({ success: false, message: 'Nenhum produto vencedor na DPC para adicionar ao carrinho.' });
      }

      dpcCarrinhoStatus.emAndamento = true;
      dpcCarrinhoStatus.total = itensParaAdicionar.length;
      dpcCarrinhoStatus.atual = 0;
      dpcCarrinhoStatus.sucessos = 0;
      dpcCarrinhoStatus.erros = 0;
      dpcCarrinhoStatus.ultimoItem = '';
      dpcCarrinhoStatus.itens = [];

      res.json({
        success: true,
        message: `Montagem de carrinho iniciada na DPC com ${itensParaAdicionar.length} produtos.`,
        status: dpcCarrinhoStatus
      });

      (async () => {
        let robot = null;
        try {
          robot = new DpcRobot({ headless: true });
          await robot.iniciar();

          // 🛡️ REGRA CRÍTICA: Validação e esvaziamento prévio obrigatório
          dpcCarrinhoStatus.ultimoItem = 'Garantindo carrinho limpo com 0 itens...';
          await garantirCarrinhoVazioRobo(robot, 'dpc');

          for (let i = 0; i < itensParaAdicionar.length; i++) {
            const item = itensParaAdicionar[i];
            dpcCarrinhoStatus.atual = i + 1;
            dpcCarrinhoStatus.ultimoItem = `${item.ean} (Qtd: ${item.quantidade})`;

            const resItem = await robot.adicionarAoCarrinho(item.ean, item.quantidade, item.descricao);
            if (resItem.sucesso) {
              dpcCarrinhoStatus.sucessos++;
              dpcCarrinhoStatus.itens.push({ ean: item.ean, quantidade: item.quantidade, status: 'ADICIONADO' });
            } else {
              dpcCarrinhoStatus.erros++;
              dpcCarrinhoStatus.itens.push({ ean: item.ean, quantidade: item.quantidade, status: 'FALHOU', motivo: resItem.motivo });
            }
          }
        } catch (botErr) {
          console.error('[BelaPed Carrinho DPC] Erro no robô:', botErr.message);
        } finally {
          if (robot) await robot.fechar().catch(() => {});
          dpcCarrinhoStatus.emAndamento = false;
        }
      })();
    } catch (err) {
      dpcCarrinhoStatus.emAndamento = false;
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/status-carrinho-dpc', (req, res) => {
    res.json({ success: true, status: dpcCarrinhoStatus });
  });

  // Estado de montagem do carrinho na Profarma
  const profarmaCarrinhoStatus = {
    emAndamento: false,
    total: 0,
    atual: 0,
    sucessos: 0,
    erros: 0,
    ultimoItem: '',
    itens: []
  };

  /**
   * POST /api/belaped/montar-carrinho-profarma
   */
  router.post('/montar-carrinho-profarma', async (req, res) => {
    try {
      if (profarmaCarrinhoStatus.emAndamento) {
        return res.status(400).json({ success: false, message: 'Montagem de carrinho na Profarma já em andamento.' });
      }

      let itensParaAdicionar = req.body.itens || [];
      if (!Array.isArray(itensParaAdicionar) || itensParaAdicionar.length === 0) {
        const produtosGanhadores = db.prepare(`
          SELECT c.ean, c.descricao, c.saldo, c.vmd_ponderado, cr.preco
          FROM compras_estoque_cache c
          JOIN belaped_cotacoes_reais cr ON cr.ean = c.ean AND cr.fornecedor = 'PROFARMA' AND cr.disponivel = 1
          WHERE c.ean IS NOT NULL AND length(c.ean) >= 7
            AND (c.saldo <= 0 OR c.saldo < c.est_minimo_calculado)
            AND c.curva_abc IN ('A', 'B')
          ORDER BY (c.saldo <= 0) DESC, c.vmd_ponderado DESC
          LIMIT 50
        `).all();

        itensParaAdicionar = produtosGanhadores.map(p => {
          const vmd = Number(p.vmd_ponderado) || 0;
          const saldo = Number(p.saldo) || 0;
          const necessidade7d = Math.ceil(vmd * 7 * 1.15);
          const qtd = saldo <= 0 ? Math.max(1, Math.abs(saldo) + necessidade7d) : Math.max(1, necessidade7d - saldo);
          return { ean: p.ean, quantidade: qtd, descricao: p.descricao };
        });
      }

      if (itensParaAdicionar.length === 0) {
        return res.status(400).json({ success: false, message: 'Nenhum produto vencedor na Profarma para adicionar ao carrinho.' });
      }

      profarmaCarrinhoStatus.emAndamento = true;
      profarmaCarrinhoStatus.total = itensParaAdicionar.length;
      profarmaCarrinhoStatus.atual = 0;
      profarmaCarrinhoStatus.sucessos = 0;
      profarmaCarrinhoStatus.erros = 0;
      profarmaCarrinhoStatus.ultimoItem = '';
      profarmaCarrinhoStatus.itens = [];

      res.json({
        success: true,
        message: `Montagem de carrinho iniciada na Profarma com ${itensParaAdicionar.length} produtos.`,
        status: profarmaCarrinhoStatus
      });

      (async () => {
        let robot = null;
        try {
          robot = new ProfarmaRobot({ headless: true });
          await robot.iniciar();

          // 🛡️ REGRA CRÍTICA: Validação e esvaziamento prévio obrigatório
          profarmaCarrinhoStatus.ultimoItem = 'Garantindo carrinho limpo com 0 itens...';
          await garantirCarrinhoVazioRobo(robot, 'profarma');

          for (let i = 0; i < itensParaAdicionar.length; i++) {
            const item = itensParaAdicionar[i];
            profarmaCarrinhoStatus.atual = i + 1;
            profarmaCarrinhoStatus.ultimoItem = `${item.ean} (Qtd: ${item.quantidade})`;

            const resItem = await robot.adicionarAoCarrinho(item.ean, item.quantidade, item.descricao);
            if (resItem.sucesso) {
              profarmaCarrinhoStatus.sucessos++;
              profarmaCarrinhoStatus.itens.push({ ean: item.ean, quantidade: item.quantidade, status: 'ADICIONADO' });
            } else {
              profarmaCarrinhoStatus.erros++;
              profarmaCarrinhoStatus.itens.push({ ean: item.ean, quantidade: item.quantidade, status: 'FALHOU', motivo: resItem.motivo });
            }
          }
        } catch (botErr) {
          console.error('[BelaPed Carrinho Profarma] Erro no robô:', botErr.message);
        } finally {
          if (robot) await robot.fechar().catch(() => {});
          profarmaCarrinhoStatus.emAndamento = false;
        }
      })();
    } catch (err) {
      profarmaCarrinhoStatus.emAndamento = false;
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/status-carrinho-profarma', (req, res) => {
    res.json({ success: true, status: profarmaCarrinhoStatus });
  });

  // Estado de montagem do carrinho no Martins
  const martinsCarrinhoStatus = {
    emAndamento: false,
    total: 0,
    atual: 0,
    sucessos: 0,
    erros: 0,
    ultimoItem: '',
    itens: []
  };

  /**
   * POST /api/belaped/montar-carrinho-martins
   */
  router.post('/montar-carrinho-martins', async (req, res) => {
    try {
      if (martinsCarrinhoStatus.emAndamento) {
        return res.status(400).json({ success: false, message: 'Montagem de carrinho no Martins já em andamento.' });
      }

      let itensParaAdicionar = req.body.itens || [];
      if (!Array.isArray(itensParaAdicionar) || itensParaAdicionar.length === 0) {
        const produtosGanhadores = db.prepare(`
          SELECT c.ean, c.descricao, c.saldo, c.vmd_ponderado, cr.preco
          FROM compras_estoque_cache c
          JOIN belaped_cotacoes_reais cr ON cr.ean = c.ean AND cr.fornecedor = 'MARTINS' AND cr.disponivel = 1
          WHERE c.ean IS NOT NULL AND length(c.ean) >= 7
            AND (c.saldo <= 0 OR c.saldo < c.est_minimo_calculado)
            AND c.curva_abc IN ('A', 'B')
          ORDER BY (c.saldo <= 0) DESC, c.vmd_ponderado DESC
          LIMIT 50
        `).all();

        itensParaAdicionar = produtosGanhadores.map(p => {
          const vmd = Number(p.vmd_ponderado) || 0;
          const saldo = Number(p.saldo) || 0;
          const necessidade7d = Math.ceil(vmd * 7 * 1.15);
          const qtd = saldo <= 0 ? Math.max(1, Math.abs(saldo) + necessidade7d) : Math.max(1, necessidade7d - saldo);
          return { ean: p.ean, quantidade: qtd, descricao: p.descricao };
        });
      }

      if (itensParaAdicionar.length === 0) {
        return res.status(400).json({ success: false, message: 'Nenhum produto vencedor no Martins para adicionar ao carrinho.' });
      }

      martinsCarrinhoStatus.emAndamento = true;
      martinsCarrinhoStatus.total = itensParaAdicionar.length;
      martinsCarrinhoStatus.atual = 0;
      martinsCarrinhoStatus.sucessos = 0;
      martinsCarrinhoStatus.erros = 0;
      martinsCarrinhoStatus.ultimoItem = '';
      martinsCarrinhoStatus.itens = [];

      res.json({
        success: true,
        message: `Montagem de carrinho iniciada no Martins com ${itensParaAdicionar.length} produtos.`,
        status: martinsCarrinhoStatus
      });

      (async () => {
        let robot = null;
        try {
          robot = new MartinsRobot({ headless: true });
          await robot.iniciar();

          // 🛡️ REGRA CRÍTICA: Validação e esvaziamento prévio obrigatório
          martinsCarrinhoStatus.ultimoItem = 'Garantindo carrinho limpo com 0 itens...';
          await garantirCarrinhoVazioRobo(robot, 'martins');

          for (let i = 0; i < itensParaAdicionar.length; i++) {
            const item = itensParaAdicionar[i];
            martinsCarrinhoStatus.atual = i + 1;
            martinsCarrinhoStatus.ultimoItem = `${item.ean} (Qtd: ${item.quantidade})`;

            const resItem = await robot.adicionarAoCarrinho(item.ean, item.quantidade, item.descricao);
            if (resItem.sucesso) {
              martinsCarrinhoStatus.sucessos++;
              martinsCarrinhoStatus.itens.push({ ean: item.ean, quantidade: item.quantidade, status: 'ADICIONADO' });
            } else {
              martinsCarrinhoStatus.erros++;
              martinsCarrinhoStatus.itens.push({ ean: item.ean, quantidade: item.quantidade, status: 'FALHOU', motivo: resItem.motivo });
            }
          }
        } catch (botErr) {
          console.error('[BelaPed Carrinho Martins] Erro no robô:', botErr.message);
        } finally {
          if (robot) await robot.fechar().catch(() => {});
          martinsCarrinhoStatus.emAndamento = false;
        }
      })();
    } catch (err) {
      martinsCarrinhoStatus.emAndamento = false;
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/status-carrinho-martins', (req, res) => {
    res.json({ success: true, status: martinsCarrinhoStatus });
  });

  /**
   * POST /api/belaped/limpar-carrinhos
   * Aciona a limpeza explícita e confirmação de 0 itens para os portais informados (ou todos os 6)
   */
  router.post('/limpar-carrinhos', async (req, res) => {
    const portais = req.body.portais || ['soton', 'divimed', 'distrimed', 'profarma', 'dpc', 'martins'];
    try {
      console.log(`[BelaPed API] Disparo manual de limpeza de carrinhos para: ${portais.join(', ')}...`);
      const resultados = await garantirCarrinhosVazios(portais);
      res.json({
        success: true,
        message: 'Todos os carrinhos selecionados foram confirmados vazios (0 itens).',
        resultados
      });
    } catch (err) {
      console.error('[BelaPed API] Erro ao limpar carrinhos:', err.message);
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PEDIDOS (histórico/acompanhamento)
  // REGRA DE SEGURANÇA: os robôs NUNCA finalizam compras. Eles só montam o carrinho.
  // A finalização é feita pelo usuário no portal; aqui só registramos/atualizamos status manualmente.
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS belaped_pedidos (
        id TEXT PRIMARY KEY,
        distribuidora TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'CARRINHO_GERADO',
        total REAL DEFAULT 0,
        qtd_itens INTEGER DEFAULT 0,
        qtd_unidades INTEGER DEFAULT 0,
        prazo_previsto TEXT,
        nf TEXT,
        observacoes TEXT,
        criado_por TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS belaped_pedidos_itens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pedido_id TEXT NOT NULL,
        ean TEXT,
        descricao TEXT,
        qtd_pedida REAL DEFAULT 0,
        preco_cotado REAL DEFAULT 0,
        qtd_faturada REAL,
        FOREIGN KEY (pedido_id) REFERENCES belaped_pedidos(id) ON DELETE CASCADE
      );
    `);
  } catch (e) {
    console.error('[BelaPed] Erro ao criar tabelas de pedidos:', e.message);
  }

  const STATUS_PEDIDO = ['RASCUNHO', 'CARRINHO_GERADO', 'FINALIZADO_PELO_USUARIO', 'FATURADO', 'RECEBIDO', 'CANCELADO'];

  /**
   * POST /api/belaped/pedidos
   * Registra um carrinho gerado. Body: { distribuidora, itens: [{ean, descricao, quantidade, preco}], observacoes }
   */
  router.post('/pedidos', (req, res) => {
    try {
      const { distribuidora, itens, observacoes } = req.body || {};
      if (!distribuidora || !Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ success: false, error: 'Informe distribuidora e ao menos um item.' });
      }
      const portal = db.prepare('SELECT prazo_dias_padrao FROM belaped_portais WHERE upper(nome) = upper(?) OR id = lower(?)').get(distribuidora, distribuidora);
      const prazo = portal ? new Date(Date.now() + (portal.prazo_dias_padrao || 28) * 86400000).toISOString().slice(0, 10) : null;
      const id = crypto.randomUUID();
      const linhas = itens.map(i => ({
        ean: i.ean || null,
        descricao: i.descricao || '',
        qtd: Number(i.quantidade ?? i.qtd) || 0,
        preco: Number(i.preco ?? i.preco_cotado) || 0
      }));
      const total = linhas.reduce((s, l) => s + l.qtd * l.preco, 0);
      const unidades = linhas.reduce((s, l) => s + l.qtd, 0);

      const tx = db.transaction(() => {
        db.prepare(`INSERT INTO belaped_pedidos (id, distribuidora, status, total, qtd_itens, qtd_unidades, prazo_previsto, observacoes, criado_por)
                    VALUES (?, ?, 'CARRINHO_GERADO', ?, ?, ?, ?, ?, ?)`)
          .run(id, distribuidora, Number(total.toFixed(2)), linhas.length, unidades, prazo, observacoes || null, (req.user && (req.user.name || req.user.id)) || null);
        const ins = db.prepare('INSERT INTO belaped_pedidos_itens (pedido_id, ean, descricao, qtd_pedida, preco_cotado) VALUES (?, ?, ?, ?, ?)');
        for (const l of linhas) ins.run(id, l.ean, l.descricao, l.qtd, l.preco);
      });
      tx();
      res.json({ success: true, id });
    } catch (err) {
      console.error('[BelaPed] Erro ao registrar pedido:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/belaped/pedidos?status=&distribuidora=
   * Lista pedidos com totais por distribuidora.
   */
  router.get('/pedidos', (req, res) => {
    try {
      const { status, distribuidora } = req.query;
      let sql = 'SELECT * FROM belaped_pedidos WHERE 1=1';
      const params = [];
      if (status) { sql += ' AND status = ?'; params.push(status); }
      if (distribuidora) { sql += ' AND distribuidora = ?'; params.push(distribuidora); }
      sql += ' ORDER BY created_at DESC LIMIT 300';
      const pedidos = db.prepare(sql).all(...params);
      const totais = {};
      for (const p of pedidos) {
        if (p.status === 'CANCELADO') continue;
        totais[p.distribuidora] = Number(((totais[p.distribuidora] || 0) + (p.total || 0)).toFixed(2));
      }
      res.json({ success: true, pedidos, totais_por_distribuidora: totais });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/belaped/pedidos/:id — detalhe com itens
   */
  router.get('/pedidos/:id', (req, res) => {
    try {
      const pedido = db.prepare('SELECT * FROM belaped_pedidos WHERE id = ?').get(req.params.id);
      if (!pedido) return res.status(404).json({ success: false, error: 'Pedido não encontrado.' });
      const itens = db.prepare('SELECT * FROM belaped_pedidos_itens WHERE pedido_id = ?').all(req.params.id);
      res.json({ success: true, pedido, itens });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * PUT /api/belaped/pedidos/:id/status — atualização MANUAL de status. Body: { status, nf?, observacoes? }
   */
  router.put('/pedidos/:id/status', (req, res) => {
    try {
      const { status, nf, observacoes } = req.body || {};
      if (!STATUS_PEDIDO.includes(status)) {
        return res.status(400).json({ success: false, error: 'Status inválido.' });
      }
      const r = db.prepare(`UPDATE belaped_pedidos SET status = ?, nf = COALESCE(?, nf), observacoes = COALESCE(?, observacoes), updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(status, nf || null, observacoes || null, req.params.id);
      if (!r.changes) return res.status(404).json({ success: false, error: 'Pedido não encontrado.' });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/belaped/alertas — alertas de pedidos (aparecem somente dentro do Belinha)
   */
  router.get('/alertas', (req, res) => {
    try {
      const alertas = [];
      const parados = db.prepare(`SELECT id, distribuidora, total FROM belaped_pedidos
        WHERE status = 'CARRINHO_GERADO' AND datetime(created_at) <= datetime('now', '-1 day')`).all();
      for (const p of parados) {
        alertas.push({
          tipo: 'CARRINHO_PENDENTE', nivel: 'warning', pedido_id: p.id,
          mensagem: `Carrinho da ${p.distribuidora} (R$ ${Number(p.total).toFixed(2)}) está há mais de 24h aguardando você finalizar no portal.`
        });
      }
      const atrasados = db.prepare(`SELECT id, distribuidora, prazo_previsto FROM belaped_pedidos
        WHERE status IN ('FINALIZADO_PELO_USUARIO','FATURADO') AND prazo_previsto IS NOT NULL AND date(prazo_previsto) < date('now')`).all();
      for (const p of atrasados) {
        alertas.push({
          tipo: 'PEDIDO_ATRASADO', nivel: 'danger', pedido_id: p.id,
          mensagem: `Pedido da ${p.distribuidora} passou do prazo previsto (${p.prazo_previsto}) e ainda não foi recebido.`
        });
      }
      // Alertas de queda de preço: cotação real atual >=5% abaixo da última compra
      try {
        const quedas = db.prepare(`
          SELECT r.fornecedor, r.descricao, r.preco, c.preco_unitario_ult_compra AS ult
          FROM belaped_cotacoes_reais r
          JOIN compras_estoque_cache c ON c.ean = r.ean
          WHERE r.preco > 0 AND r.disponivel = 1 AND c.preco_unitario_ult_compra > 0
            AND r.preco <= c.preco_unitario_ult_compra * 0.95
            AND (c.saldo <= 0 OR c.saldo < c.est_minimo_calculado)
          ORDER BY (c.preco_unitario_ult_compra - r.preco) / c.preco_unitario_ult_compra DESC
          LIMIT 10`).all();
        for (const q of quedas) {
          const pct = ((q.ult - q.preco) / q.ult) * 100;
          alertas.push({
            tipo: 'QUEDA_PRECO', nivel: 'info',
            mensagem: `${q.descricao || 'Produto'}: ${q.fornecedor} a R$ ${Number(q.preco).toFixed(2)} (${pct.toFixed(0)}% abaixo da última compra, R$ ${Number(q.ult).toFixed(2)}).`
          });
        }
      } catch (e) {
        console.error('[BelaPed] Alertas de preço indisponíveis:', e.message);
      }
      res.json({ success: true, alertas });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  try {
    db.exec('ALTER TABLE belaped_pedidos_itens ADD COLUMN preco_cobrado REAL');
  } catch (e) { /* coluna já existe */ }

  /**
   * PUT /api/belaped/pedidos/:id/conferencia
   * Body: { itens: [{ ean, qtd_faturada, preco_cobrado }] }
   * Compara com o pedido e devolve divergências de quantidade (corte) e de preço.
   */
  router.put('/pedidos/:id/conferencia', (req, res) => {
    try {
      const { itens } = req.body || {};
      if (!Array.isArray(itens)) return res.status(400).json({ success: false, error: 'Informe itens.' });
      const upd = db.prepare('UPDATE belaped_pedidos_itens SET qtd_faturada = ?, preco_cobrado = ? WHERE pedido_id = ? AND ean = ?');
      db.transaction(() => {
        for (const i of itens) upd.run(Number(i.qtd_faturada) || 0, i.preco_cobrado != null ? Number(i.preco_cobrado) : null, req.params.id, i.ean);
      })();
      const linhas = db.prepare('SELECT * FROM belaped_pedidos_itens WHERE pedido_id = ?').all(req.params.id);
      const divergencias = [];
      let pedidas = 0, faturadas = 0;
      for (const l of linhas) {
        pedidas += l.qtd_pedida || 0;
        if (l.qtd_faturada == null) continue;
        faturadas += l.qtd_faturada;
        if (l.qtd_faturada < l.qtd_pedida) {
          divergencias.push({ ean: l.ean, descricao: l.descricao, tipo: 'CORTE', pedido: l.qtd_pedida, faturado: l.qtd_faturada });
        }
        if (l.preco_cobrado != null && l.preco_cobrado > (l.preco_cotado || 0) * 1.005) {
          divergencias.push({ ean: l.ean, descricao: l.descricao, tipo: 'PRECO_MAIOR', cotado: l.preco_cotado, cobrado: l.preco_cobrado });
        }
      }
      res.json({
        success: true,
        taxa_atendimento_pct: pedidas ? Number(((faturadas / pedidas) * 100).toFixed(1)) : 0,
        divergencias
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/belaped/simulador-giro
   * - Se chamado com ?busca=termo (sem produto_id): retorna lista de produtos do estoque para seleção rápida
   * - Se chamado com ?produto_id=123: retorna análise completa de giro, de quantos em quantos dias vende 1 un,
   *   duração média do estoque, equivalentes da mesma molécula e histórico real de datas de vendas (se Firebird ativo).
   */
  router.get('/simulador-giro', async (req, res) => {
    try {
      const { busca, produto_id } = req.query;

      if (!produto_id) {
        let sql = `
          SELECT 
            produto_id, descricao, apresentacao, ean, curva_abc, saldo,
            est_minimo_calculado, vmd_ponderado, vendas_30d, vendas_31_60d,
            COALESCE(vendas_61_90d, 0) as vendas_61_90d,
            COALESCE(vendas_10m, 0) as vendas_10m,
            custo_unitario, preco_venda_vigente, ultima_compra_fornecedor, ultima_compra_data
          FROM compras_estoque_cache
        `;
        const params = [];
        if (busca && String(busca).trim().length > 0) {
          const termo = `%${String(busca).trim()}%`;
          sql += ` WHERE descricao LIKE ? OR ean LIKE ?`;
          params.push(termo, termo);
        } else {
          sql += ` WHERE vmd_ponderado > 0 OR vendas_30d > 0`;
        }
        sql += ` ORDER BY vmd_ponderado DESC, vendas_30d DESC, saldo DESC LIMIT 30`;

        const lista = db.prepare(sql).all(...params).map(p => {
          const v30 = Number(p.vendas_30d) || 0;
          const v60 = Number(p.vendas_31_60d) || 0;
          const v90 = Number(p.vendas_61_90d) || 0;
          const v10m = Number(p.vendas_10m) || (v30 + v60 + v90);
          const vmd = Number(p.vmd_ponderado) > 0
            ? Number(p.vmd_ponderado)
            : (v30 + v60 + v90 > 0 ? (v30 + v60 + v90) / 90 : (v10m > 0 ? v10m / 300 : 0));
          const diasPorUnidade = vmd > 0 ? Number((1 / vmd).toFixed(1)) : null;
          const saldoAtual = Math.max(0, Number(p.saldo) || 0);
          const diasDuracao = vmd > 0 && saldoAtual > 0 ? Math.round(saldoAtual / vmd) : 0;

          return {
            ...p,
            vmd_efetivo: Number(vmd.toFixed(3)),
            dias_por_unidade: diasPorUnidade,
            dias_duracao_estoque: diasDuracao
          };
        });

        return res.json({ success: true, produtos: lista });
      }

      // Detalhe completo de 1 produto específico
      const prod = db.prepare(`
        SELECT 
          produto_id, descricao, apresentacao, ean, curva_abc, saldo,
          est_minimo_calculado, vmd_ponderado, vendas_30d, vendas_31_60d,
          COALESCE(vendas_61_90d, 0) as vendas_61_90d,
          COALESCE(vendas_10m, 0) as vendas_10m,
          custo_unitario, preco_unitario_ult_compra, preco_venda_vigente,
          categoria_id, ultima_compra_fornecedor, ultima_compra_data
        FROM compras_estoque_cache
        WHERE produto_id = ?
      `).get(Number(produto_id));

      if (!prod) {
        return res.status(404).json({ success: false, error: 'Produto não encontrado no cache de estoque.' });
      }

      const v30 = Number(prod.vendas_30d) || 0;
      const v60 = Number(prod.vendas_31_60d) || 0;
      const v90 = Number(prod.vendas_61_90d) || 0;
      const vendas90d = v30 + v60 + v90;
      const v10m = Math.max(Number(prod.vendas_10m) || 0, vendas90d);

      // VMD efetivo: usa VMD ponderado de 90d, ou se zerado (ex: esquecido 6m), usa média histórica de 10m
      const vmdEfetivo = Number(prod.vmd_ponderado) > 0
        ? Number(prod.vmd_ponderado)
        : (vendas90d > 0 ? vendas90d / 90 : (v10m > 0 ? v10m / 300 : 0));

      const diasPorUnidade = vmdEfetivo > 0 ? Number((1 / vmdEfetivo).toFixed(1)) : null;
      const saldoFisico = Math.max(0, Number(prod.saldo) || 0);
      const diasDuracaoEstoque = vmdEfetivo > 0 && saldoFisico > 0 ? Math.round(saldoFisico / vmdEfetivo) : 0;

      // Busca equivalentes da mesma molécula + dosagem + apresentação na loja
      let equivalentes = [];
      let chaveEquivalencia = null;
      try {
        const isMed = prod.categoria_id !== 5 && prod.categoria_id !== 7;
        if (isMed && comprasEquivalentesService && typeof comprasEquivalentesService.extrairAtributosProduto === 'function') {
          const attr = comprasEquivalentesService.extrairAtributosProduto(prod.descricao || '');
          if (attr && attr.dosagem && attr.principio && attr.principio !== 'OUTROS' && attr.principio.length >= 4) {
            chaveEquivalencia = attr.chave;
            const prefixoPrincipio = attr.principio.split(' ')[0];
            const candidatos = db.prepare(`
              SELECT produto_id, descricao, ean, saldo, vmd_ponderado, vendas_30d, vendas_31_60d,
                     COALESCE(vendas_61_90d, 0) as vendas_61_90d, COALESCE(vendas_10m, 0) as vendas_10m
              FROM compras_estoque_cache
              WHERE produto_id <> ? AND descricao LIKE ?
            `).all(Number(prod.produto_id), `%${prefixoPrincipio}%`);

            equivalentes = candidatos.filter(c => {
              const a2 = comprasEquivalentesService.extrairAtributosProduto(c.descricao || '');
              return a2 && a2.chave === chaveEquivalencia && (Number(c.saldo) > 0 || Number(c.vmd_ponderado) > 0 || Number(c.vendas_10m) > 0);
            });
          }
        }
      } catch (e) {}

      // Tenta buscar as últimas datas reais de venda no Firebird (com timeout rápido de 3s para não travar)
      let historicoVendasDatas = [];
      try {
        const { queryDigifarma } = require('./services/digifarma.service');
        const rowsFb = await queryDigifarma(`
          SELECT FIRST 35
            v.VENDA_DATA_HORA,
            iv.ITEMVEND_QUANT
          FROM ITEM_VENDAS iv
          JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
          WHERE iv.PRODUTO_ID = ?
            AND v.CANCELADO <> 'S'
          ORDER BY v.VENDA_DATA_HORA DESC
        `, [Number(prod.produto_id)], 3000);

        if (Array.isArray(rowsFb)) {
          historicoVendasDatas = rowsFb.map(r => ({
            data_hora: r.VENDA_DATA_HORA,
            quantidade: Number(r.ITEMVEND_QUANT) || 1
          }));
        }
      } catch (eFb) {
        // Se Firebird offline ou lento, segue normalmente com os dados do cache
      }

      res.json({
        success: true,
        produto: {
          ...prod,
          vendas_90d: vendas90d,
          vendas_10m: v10m,
          vmd_efetivo: Number(vmdEfetivo.toFixed(4)),
          dias_por_unidade: diasPorUnidade,
          dias_duracao_estoque: diasDuracaoEstoque,
          chave_equivalencia: chaveEquivalencia,
          equivalentes,
          historico_vendas_datas: historicoVendasDatas
        }
      });
    } catch (err) {
      console.error('[BelaPed] Erro em simulador-giro:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

module.exports = belapedEndpoints;
