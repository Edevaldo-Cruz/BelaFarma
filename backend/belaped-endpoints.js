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
const { OrienteRobot, identificarCondicaoIdeal } = require('./belaped-robot-oriente');
const { PanpharmaRobot } = require('./belaped-robot-panpharma');
const { validarCorrespondenciaProduto } = require('./belaped-validador');
const farmacoMatcher = require('./belaped-farmaco-matcher');
const motorEssencia = require('./belaped-motor-essencia');
const { auditarPortalSeguro, auditarTodasDistribuidoras } = require('./belaped-auditoria-prazos');
const { executarCheckoutRobo } = require('./belaped-checkout');

function gerarUrlDistribuidoraProduto(fornecedorNome, ean, descricao) {
  const f = (fornecedorNome || '').toUpperCase();
  const termo = String(ean || '').trim() || encodeURIComponent(descricao || '');
  if (!termo) return null;
  if (f.includes('PROFARMA')) {
    return `https://pedido.profarma.com.br/novo-pedido?q=${termo}`;
  }
  if (f.includes('SOTON')) {
    return `https://sotonfarma.meuspedidos.com.br/?busca=${termo}`;
  }
  if (f.includes('DPC')) {
    return `https://dpcnet.com.br/catalogo?busca=${termo}&visualizacao=bloco-1&ordenacao=ordem-0`;
  }
  if (f.includes('MARTINS')) {
    return `https://www.martinsatacado.com.br/busca?q=${termo}`;
  }
  if (f.includes('DISTRIMED')) {
    return `https://inovacao.distrimed.com.br/produtos?pesquisa=${termo}`;
  }
  if (f.includes('DIVIMED')) {
    return `https://divimed.artpedidoweb.com.br/#/comprar?busca=${termo}`;
  }
  if (f.includes('ORIENTE')) {
    return `https://pedidoweb.orientefarma.com.br/pedidos?busca=${termo}`;
  }
  if (f.includes('PANPHARMA') || f.includes('PANFARMA')) {
    return `https://www.panpharma.com.br/`;
  }
  return null;
}

/**
 * Função Canônica de Conferência de Cortes (R4)
 * Executa em transação SQLite atômica:
 * a) Atualiza belaped_pedidos_itens com qtd_faturada e preco_cobrado
 * b) Para cada item cortado, re-enfileira em belaped_itens_avulsos para re-cotação prioritária
 * c) Se houver corte de valor, recalcula orders (totalValue e installments),
 *    recalcula boletos pendentes protegendo o saldo mensal em monthly_limits,
 *    e atualiza belaped_pedidos para FATURADO_COM_CORTE.
 */
function processarConferenciaCortes({ db: dbInstance, pedidoId, itensConferidos }) {
  if (!dbInstance || !pedidoId || !Array.isArray(itensConferidos)) {
    throw new Error('Parâmetros inválidos para conferência de cortes.');
  }

  let valorCorteTotal = 0;
  const cortesDetectados = [];
  const divergencias = [];
  let pedidas = 0;
  let faturadas = 0;

  const resultado = dbInstance.transaction(() => {
    // 1. Atualiza belaped_pedidos_itens com qtd_faturada e preco_cobrado
    const updItem = dbInstance.prepare(`
      UPDATE belaped_pedidos_itens 
      SET qtd_faturada = ?, preco_cobrado = ? 
      WHERE pedido_id = ? AND ean = ?
    `);

    for (const item of itensConferidos) {
      updItem.run(
        Number(item.qtd_faturada) || 0,
        item.preco_cobrado != null ? Number(item.preco_cobrado) : null,
        pedidoId,
        String(item.ean).trim()
      );
    }

    // 2. Avalia divergências e identifica todos os cortes (qtd_faturada < qtd_pedida)
    const linhas = dbInstance.prepare('SELECT * FROM belaped_pedidos_itens WHERE pedido_id = ?').all(pedidoId);

    let nomeDistribuidora = 'distribuidora';
    try {
      const belapedPedido = dbInstance.prepare('SELECT * FROM belaped_pedidos WHERE id = ?').get(pedidoId);
      if (belapedPedido && belapedPedido.distribuidora) {
        nomeDistribuidora = belapedPedido.distribuidora;
      }
    } catch (e) {}

    for (const l of linhas) {
      const qtdPedida = Number(l.qtd_pedida || 0);
      pedidas += qtdPedida;

      if (l.qtd_faturada == null) continue;
      const qtdFaturada = Number(l.qtd_faturada);
      faturadas += qtdFaturada;

      if (qtdFaturada < qtdPedida) {
        const qtdCorte = qtdPedida - qtdFaturada;
        const precoRef = Number(l.preco_cotado || l.preco_cobrado || 0);
        const subtotalCorte = Number((qtdCorte * precoRef).toFixed(2));
        valorCorteTotal += subtotalCorte;

        cortesDetectados.push({
          ean: l.ean,
          descricao: l.descricao,
          qtdCorte,
          precoRef,
          subtotalCorte
        });

        divergencias.push({
          ean: l.ean,
          descricao: l.descricao,
          tipo: 'CORTE',
          pedido: qtdPedida,
          faturado: qtdFaturada,
          corte: qtdCorte,
          valorCorte: subtotalCorte
        });

        // 3. Para cada item cortado, re-enfileira em belaped_itens_avulsos
        const cleanEan = String(l.ean || Date.now()).replace(/\D/g, '') || String(l.ean || '').trim();
        const avulsoId = `corte_${pedidoId}_${cleanEan}`;
        try {
          dbInstance.prepare(`
            INSERT INTO belaped_itens_avulsos (
              id, produto_id, descricao, ean, quantidade, preco_referencia, motivo, adicionado_por, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Auditoria de Cortes BelaPed', CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
              quantidade = excluded.quantidade,
              motivo = excluded.motivo
          `).run(
            avulsoId,
            l.produto_id || null,
            l.descricao || 'Produto Cortado',
            l.ean,
            qtdCorte,
            precoRef,
            `Corte no pedido da distribuidora ${nomeDistribuidora} (#${pedidoId}) - Corte de ${qtdCorte} un.`
          );
        } catch (e) {
          console.warn('[BelaPed] Aviso ao re-enfileirar item avulso cortado:', e.message);
        }
      }

      if (l.preco_cobrado != null && l.preco_cobrado > (l.preco_cotado || 0) * 1.005) {
        divergencias.push({
          ean: l.ean,
          descricao: l.descricao,
          tipo: 'PRECO_MAIOR',
          cotado: l.preco_cotado,
          cobrado: l.preco_cobrado
        });
      }
    }

    // 4. Se houver corte de valor, recalcula orders, boletos e belaped_pedidos
    let novoTotal = null;
    if (valorCorteTotal > 0) {
      try {
        const order = dbInstance.prepare('SELECT * FROM orders WHERE id = ?').get(pedidoId);
        if (order) {
          const totalAntigo = Number(order.totalValue || 0);
          novoTotal = Math.max(0, Number((totalAntigo - valorCorteTotal).toFixed(2)));

          // Recalcula boletos vinculados
          const boletosVinculados = dbInstance.prepare(`
            SELECT * FROM boletos 
            WHERE order_id = ? 
            ORDER BY due_date ASC
          `).all(pedidoId);

          const boletosPendentes = boletosVinculados.filter(b => String(b.status).toLowerCase() === 'pendente');
          const boletosPagos = boletosVinculados.filter(b => String(b.status).toLowerCase() === 'pago');

          if (boletosPendentes.length > 0) {
            const totalPago = boletosPagos.reduce((acc, b) => acc + Number(b.value || 0), 0);
            const saldoRestante = Math.max(0, Number((novoTotal - totalPago).toFixed(2)));

            const valPorBoleto = Math.floor((saldoRestante / boletosPendentes.length) * 100) / 100;
            boletosPendentes.forEach((b, idx) => {
              const isUltimo = idx === boletosPendentes.length - 1;
              const valBoleto = isUltimo
                ? Number((saldoRestante - (valPorBoleto * (boletosPendentes.length - 1))).toFixed(2))
                : valPorBoleto;

              dbInstance.prepare('UPDATE boletos SET value = ? WHERE id = ?').run(valBoleto, b.id);
            });
          }

          // Recalcula parcelas em orders.installments
          let installments = [];
          try {
            installments = JSON.parse(order.installments || '[]');
          } catch (e) {
            installments = [];
          }

          if (installments.length > 0) {
            const valInst = Math.floor((novoTotal / installments.length) * 100) / 100;
            installments = installments.map((inst, idx) => ({
              ...inst,
              value: idx === installments.length - 1
                ? Number((novoTotal - (valInst * (installments.length - 1))).toFixed(2))
                : valInst
            }));
          }

          dbInstance.prepare('UPDATE orders SET totalValue = ?, installments = ? WHERE id = ?').run(
            novoTotal,
            JSON.stringify(installments),
            pedidoId
          );
        }
      } catch (e) {
        console.warn('[BelaPed] Aviso ao atualizar orders/boletos no corte:', e.message);
      }

      // Atualiza belaped_pedidos: adjust total = total - valorCorteTotal, status = 'FATURADO_COM_CORTE'
      try {
        dbInstance.prepare(`
          UPDATE belaped_pedidos 
          SET total = MAX(0, total - ?), 
              status = 'FATURADO_COM_CORTE', 
              updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(valorCorteTotal, pedidoId);

        if (novoTotal === null) {
          const bp = dbInstance.prepare('SELECT total FROM belaped_pedidos WHERE id = ?').get(pedidoId);
          if (bp) novoTotal = Number(bp.total);
        }
      } catch (e) {}
    }

    return {
      success: true,
      pedidas,
      faturadas,
      taxa_atendimento_pct: pedidas ? Number(((faturadas / pedidas) * 100).toFixed(1)) : 0,
      valorCorteTotal: Number(valorCorteTotal.toFixed(2)),
      novoTotal: novoTotal != null ? Number(novoTotal.toFixed(2)) : undefined,
      cortesDetectados,
      divergencias,
      recalculado: valorCorteTotal > 0
    };
  })();

  return resultado;
}

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

      CREATE TABLE IF NOT EXISTS belaped_produtos_regras (
        chave_regra TEXT PRIMARY KEY,
        ean TEXT,
        produto_id INTEGER,
        descricao TEXT,
        nao_cotar INTEGER DEFAULT 0,
        nao_carrinho INTEGER DEFAULT 0,
        motivo_justificativa TEXT DEFAULT '',
        adiar_ate TEXT DEFAULT NULL,
        atualizado_por TEXT,
        atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_belaped_regras_ean ON belaped_produtos_regras (ean);
      CREATE INDEX IF NOT EXISTS idx_belaped_regras_pid ON belaped_produtos_regras (produto_id);
    `);

    // Migração transparente: Coluna adiar_ate para adiar produto para próxima semana
    try {
      db.prepare(`ALTER TABLE belaped_produtos_regras ADD COLUMN adiar_ate TEXT`).run();
    } catch (migRegraErr) {
      // Coluna já existe
    }

    // Migração transparente: Coluna enviado_carrinho_ate para ocultar nos cards itens que já entraram no carrinho na semana atual
    try {
      db.prepare(`ALTER TABLE belaped_produtos_regras ADD COLUMN enviado_carrinho_ate TEXT`).run();
    } catch (migCartErr) {
      // Coluna já existe
    }

    // Cadastra e sincroniza EXCLUSIVAMENTE as 4 distribuidoras reais configuradas
    const portaisReais = [
      { id: 'profarma', nome: 'PROFARMA', url: 'https://pedido.profarma.com.br/?callbackUrl=%2Fnovo-pedido', usuario: '47378578000140', min: 150.0, prazo: 35, uf: 'MG', is_mg: 1, obs: 'Distribuidora Oficial - Importação via planilha CSV e cotação robótica' },
      { id: 'dpc', nome: 'DPC DISTRIBUIDORA', url: 'https://cliente.dpcnet.com.br/?redirect=https%3A%2F%2Fdpcnet.com.br%2F', usuario: '47378578000140', min: 300.0, prazo: 28, uf: 'MG', is_mg: 1, obs: 'Distribuidora Oficial - Importação via planilha CSV e cotação robótica' },
      { id: 'soton', nome: 'SOTON FARMA', url: 'https://sotonfarma.meuspedidos.com.br/entrar', usuario: 'belafarmasul@gmail.com', min: 300.0, prazo: 21, uf: 'MG', is_mg: 1, obs: 'Distribuidora Oficial - Montagem robótica de carrinho produto a produto' },
      { id: 'distrimed', nome: 'DISTRIMED', url: 'https://inovacao.distrimed.com.br/login?referencia=/solicitacaoSac', usuario: 'bela farma sul', min: 350.0, prazo: 28, uf: 'MG', is_mg: 1, obs: 'Distribuidora Oficial - Importação automática via modal' },
      { id: 'divimed', nome: 'DIVIMED', url: 'https://divimed.artpedidoweb.com.br/#/', usuario: 'belafarmasul@gmail.com', min: 400.0, prazo: 28, uf: 'MG', is_mg: 1, obs: 'Distribuidora Oficial - Montagem robótica produto por produto por nome' },
      { id: 'martins', nome: 'MARTINS ATACADO', url: 'https://www.martinsatacado.com.br/login/pessoa-juridica?pathName=%2F', usuario: '47.378.578/0001-40', min: 200.0, prazo: 28, uf: 'MG', is_mg: 1, obs: 'Distribuidora Oficial - Pedido mínimo R$ 200,00 - Filtro estrito: apenas produtos faturados em MG' },
      { id: 'oriente', nome: 'ORIENTE FARMA', url: 'https://pedidoweb.orientefarma.com.br/auth/login', usuario: 'belafarmasul@gmail.com', min: 150.0, prazo: 28, uf: 'MG', is_mg: 1, obs: 'Distribuidora Oficial - Condições: Geral (96), Verão (4774) e Unilever (18)' }
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

    // Remove qualquer distribuidora não configurada (garante apenas as 7 oficiais)
    db.prepare(`DELETE FROM belaped_portais WHERE id NOT IN ('profarma', 'dpc', 'soton', 'distrimed', 'divimed', 'martins', 'oriente')`).run();

    // Migração transparente: Coluna url_produto para salvar link direto do produto pesquisado pelo robô
    try {
      db.prepare(`ALTER TABLE belaped_cotacoes_reais ADD COLUMN url_produto TEXT`).run();
    } catch (migErr) {}

    // Migração: Metadados de campanhas e genéricos em belaped_cotacoes_reais
    try {
      db.prepare(`ALTER TABLE belaped_cotacoes_reais ADD COLUMN condicao_comercial TEXT`).run();
    } catch (e) {}
    try {
      db.prepare(`ALTER TABLE belaped_cotacoes_reais ADD COLUMN preco_padrao REAL`).run();
    } catch (e) {}
    try {
      db.prepare(`ALTER TABLE belaped_cotacoes_reais ADD COLUMN is_generico_mais_barato INTEGER DEFAULT 0`).run();
    } catch (e) {}
    try {
      db.prepare(`ALTER TABLE belaped_cotacoes_reais ADD COLUMN ean_substituto TEXT`).run();
    } catch (e) {}
    try {
      db.prepare(`ALTER TABLE belaped_cotacoes_reais ADD COLUMN laboratorio TEXT`).run();
    } catch (e) {}
    try {
      db.prepare(`ALTER TABLE belaped_cotacoes_reais ADD COLUMN is_substituto INTEGER DEFAULT 0`).run();
    } catch (e) {}
    try {
      db.prepare(`ALTER TABLE belaped_cotacoes_reais ADD COLUMN todos_concorrentes TEXT`).run();
    } catch (e) {}

    db.exec(`
      CREATE TABLE IF NOT EXISTS belaped_equivalencias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ean_original TEXT NOT NULL,
        ean_substituto TEXT NOT NULL,
        descricao_original TEXT,
        descricao_substituto TEXT,
        laboratorio TEXT,
        principio_ativo TEXT,
        origem_portal TEXT,
        preco_original REAL,
        preco_substituto REAL,
        economia_reais REAL,
        data_vinculo TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ean_original, ean_substituto)
      );
      CREATE INDEX IF NOT EXISTS idx_belaped_equiv_orig ON belaped_equivalencias (ean_original);
      CREATE INDEX IF NOT EXISTS idx_belaped_equiv_sub ON belaped_equivalencias (ean_substituto);
    `);

    // Migração: Prazos e data de auditoria em belaped_portais
    try {
      db.prepare(`ALTER TABLE belaped_portais ADD COLUMN prazos_boleto TEXT`).run();
    } catch (e) {}
    try {
      db.prepare(`ALTER TABLE belaped_portais ADD COLUMN data_ultima_auditoria TEXT`).run();
    } catch (e) {}

    // Criação da tabela de campanhas da Distrimed
    db.exec(`
      CREATE TABLE IF NOT EXISTS belaped_distrimed_campanhas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome_opcao TEXT NOT NULL,
        termos_busca TEXT NOT NULL,
        minimo_valor REAL DEFAULT 0,
        minimo_qtd INTEGER DEFAULT 0,
        ativo INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS belaped_portais_auditoria_prazos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        portal TEXT NOT NULL,
        pedido_minimo_detectado REAL NOT NULL,
        prazos_boleto_json TEXT NOT NULL,
        melhor_prazo TEXT,
        itens_carrinho_previos INTEGER DEFAULT 0,
        status_auditoria TEXT NOT NULL,
        observacao TEXT,
        data_auditoria TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed inicial de campanhas da Distrimed caso a tabela esteja vazia
    const qtdCampanhas = db.prepare('SELECT count(*) as count FROM belaped_distrimed_campanhas').get().count;
    if (qtdCampanhas === 0) {
      const stmtCampanha = db.prepare(`
        INSERT INTO belaped_distrimed_campanhas (nome_opcao, termos_busca, minimo_valor, minimo_qtd, ativo)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmtCampanha.run('PHARMALINK - UNILEVER', 'UNILEVER, DOVE, REXONA, SEDA, CLEAR, TRESEMME, LUX, CLOSE UP', 0, 0, 1);
      stmtCampanha.run('TEMPORADA SOLAR 2026', 'PROTETOR SOLAR, BLOQUEADOR SOLAR, BRONZEADOR, SUNDOWN, CENOURA & BRONZE', 0, 0, 1);
      stmtCampanha.run('KIMBERLY PARCEIRO ESTRATÉGICO - TUDO FARMA', 'KIMBERLY, HUGGIES, INTIMUS, PLENITUD, NEVE, KLEENEX', 0, 0, 1);
      stmtCampanha.run('NESTLE CURVA C - NUTRIÇÃO INFANTIL PEDIDO MINIMO R$ 500,00', 'MUCILON, NAN, NESTOGENO, NUTRIÇÃO INFANTIL', 500.00, 0, 1);
      stmtCampanha.run('NESTLE CURVA C - NUTRIÇÃO INFANTIL PEDIDO MINIMO R$ 1.000,00', 'MUCILON, NAN, NESTOGENO', 1000.00, 0, 1);
      stmtCampanha.run('NESTLE CURVA C - NUTRIÇÃO ADULTO PEDIDO MINIMO R$ 350,00', 'NUTREN, NUTREN SENIOR, NUTRIÇÃO ADULTO', 350.00, 0, 1);
      stmtCampanha.run('NESTLE CURVA C - NUTRIÇÃO ADULTO PEDIDO MINIMO R$ 500,00', 'NUTREN, NUTREN SENIOR', 500.00, 0, 1);
      stmtCampanha.run('DESCONTO DAPAGLIFLOZINA NOVA QUIMICA', 'DAPAGLIFLOZINA NOVA QUIMICA, DAPAGLIFLOZINA', 0, 0, 1);
      stmtCampanha.run('ACELERA DAPA DISTRIMED (112 UNIDADES )', 'DAPAGLIFLOZINA, FORXIGA', 0, 112, 1);
      stmtCampanha.run('DAPA EMS PAINEL DISTY (24 UNIDADES)', 'DAPAGLIFLOZINA EMS, DAPAGLIFLOZINA', 0, 24, 1);
      stmtCampanha.run('NIVEA 14/10 E 15/10', 'NIVEA', 0, 0, 1);
      stmtCampanha.run('BRINQUEDOS PRAZO 60 DIAS 17/08 A 31/10', 'BRINQUEDO, CHOCALHO, MORDEDOR', 0, 0, 1);
      console.log('[BelaPed] 12 campanhas comerciais da Distrimed cadastradas com sucesso!');
    }
  };

  try {
    initTables();
    expurgarCotacoesInconsistentes(db);
  } catch (e) {
    console.error('[BelaPed] Erro ao inicializar tabelas:', e.message);
  }

  /**
   * POST /api/belaped/expurgar-inconsistencias
   * Varre e invalida qualquer cotação no banco que não corresponda com certeza ao produto esperado
   */
  router.post('/expurgar-inconsistencias', (req, res) => {
    try {
      const removidas = expurgarCotacoesInconsistentes(db);
      res.json({ success: true, expurgadas: removidas, message: `${removidas} cotações inconsistentes foram expurgadas com sucesso.` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

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

      // Cotações reais obtidas pelos robôs (Profarma, DPC, Soton, Distrimed, Divimed, Martins, Oriente)
      const cotacoesReaisMap = {};
      const cotacoesSemEstoqueComPrecoMap = {};
      const eansConsultadosSet = new Set();
      try {
        const todasCotacoes = db.prepare(`SELECT * FROM belaped_cotacoes_reais ORDER BY preco ASC`).all();
        for (const c of todasCotacoes) {
          if (c.ean) eansConsultadosSet.add(c.ean);
          if (c.disponivel === 1 && c.preco > 0) {
            if (!cotacoesReaisMap[c.ean]) cotacoesReaisMap[c.ean] = [];
            cotacoesReaisMap[c.ean].push(c);
          } else if (c.preco > 0) {
            if (!cotacoesSemEstoqueComPrecoMap[c.ean]) cotacoesSemEstoqueComPrecoMap[c.ean] = [];
            cotacoesSemEstoqueComPrecoMap[c.ean].push(c);
          }
        }
      } catch (e) {}

      // Cache de Últimas Compras reais do ERP Digifarma (Notas Fiscais: fornecedor, data, NF, quantidade, embalagem e preço)
      const ultCompraByIdMap = new Map();
      const ultCompraByEanMap = new Map();
      try {
        const rowsUltCompra = db.prepare(`
          SELECT produto_id, ean, preco_unitario_ult_compra, preco_total_nota, quantidade,
                 embalagem, embalagem_detalhe, data_compra, fornecedor_nome, numero_nota_fiscal, fonte
          FROM digifarma_ultimas_compras_cache
        `).all();
        for (const uc of rowsUltCompra) {
          if (uc.produto_id) ultCompraByIdMap.set(Number(uc.produto_id), uc);
          if (uc.ean) ultCompraByEanMap.set(String(uc.ean).trim(), uc);
        }
      } catch (eUc) {}

      // Regras e preferências de produtos (não cotar, não colocar no carrinho, justificativas, adiar e enviado ao carrinho na semana)
      const regrasMap = {};
      try {
        const rowsRegras = db.prepare(`SELECT chave_regra, ean, produto_id, nao_cotar, nao_carrinho, motivo_justificativa, adiar_ate, enviado_carrinho_ate FROM belaped_produtos_regras`).all();
        for (const reg of rowsRegras) {
          if (reg.ean) regrasMap[reg.ean] = reg;
          if (reg.produto_id) regrasMap[`ID_${reg.produto_id}`] = reg;
          if (reg.chave_regra) regrasMap[reg.chave_regra] = reg;
        }
      } catch (e) {}

      // Itens que já entraram no carrinho na semana atual (segunda a domingo)
      const eansNoCarrinhoSemanaSet = new Set();
      try {
        const hoje = new Date();
        const diaSemana = hoje.getDay(); // 0=Dom, 1=Seg...
        const diffSegunda = diaSemana === 0 ? 6 : (diaSemana - 1);
        const inicioSemana = new Date(hoje);
        inicioSemana.setDate(hoje.getDate() - diffSegunda);
        const inicioSemanaISO = inicioSemana.toISOString().slice(0, 10);

        const rowsCarrinhoSem = db.prepare(`
          SELECT DISTINCT pi.ean
          FROM belaped_pedidos_itens pi
          JOIN belaped_pedidos p ON p.id = pi.pedido_id
          WHERE pi.ean IS NOT NULL AND pi.ean != ''
            AND date(p.data_criacao) >= date(?)
        `).all(inicioSemanaISO);
        for (const r of rowsCarrinhoSem) {
          if (r.ean) eansNoCarrinhoSemanaSet.add(String(r.ean).trim());
        }
      } catch (e) {}

      // Mapeamento de Fotos dos Produtos (scraped_images + uploads físicos)
      const fotoEanMap = new Map();
      const fotoNameList = [];
      try {
        const rowsFotos = db.prepare(`SELECT ean, name, image_url FROM scraped_images WHERE image_url IS NOT NULL AND image_url != ''`).all();
        for (const f of rowsFotos) {
          if (f.ean) fotoEanMap.set(String(f.ean).trim(), f.image_url);
          if (f.name) {
            fotoNameList.push({
              key: String(f.name).toLowerCase().replace(/[^a-z0-9]/g, ' '),
              url: f.image_url
            });
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

      // Injeta os "Produtos Desejados" (belaped_itens_avulsos) diretamente nos candidatosFinais para que sejam cotados pelos 7 robôs e entrem nos carrinhos!
      for (let idxAv = 0; idxAv < avulsos.length; idxAv++) {
        const av = avulsos[idxAv];
        const eanAv = String(av.ean || '').trim();
        const descAv = String(av.descricao || '').toUpperCase().trim();
        const prodIdAv = av.produto_id ? Number(av.produto_id) : null;

        const existente = candidatosFinais.find(c =>
          (prodIdAv && Number(c.raw.produto_id) === prodIdAv) ||
          (eanAv && String(c.raw.ean || '').trim() === eanAv) ||
          (descAv && String(c.raw.descricao || '').toUpperCase().trim() === descAv)
        );

        if (existente) {
          existente.avulsoInfo = av;
        } else {
          // Busca dados reais no compras_estoque_cache para enriquecer o Produto Desejado
          let rowCache = null;
          try {
            if (prodIdAv) {
              rowCache = db.prepare('SELECT * FROM compras_estoque_cache WHERE produto_id = ?').get(prodIdAv);
            }
            if (!rowCache && eanAv) {
              rowCache = db.prepare('SELECT * FROM compras_estoque_cache WHERE ean = ?').get(eanAv);
            }
            if (!rowCache && descAv) {
              rowCache = db.prepare('SELECT * FROM compras_estoque_cache WHERE UPPER(descricao) = ?').get(descAv);
            }
          } catch (eCacheAv) {}

          const rawSintetico = rowCache || {
            produto_id: prodIdAv || (950000 + idxAv),
            descricao: descAv || 'PRODUTO DESEJADO',
            apresentacao: '',
            ean: eanAv,
            curva_abc: 'A',
            saldo: 0,
            vmd_ponderado: 0.2,
            vendas_30d: 0,
            vendas_31_60d: 0,
            vendas_61_90d: 0,
            vendas_10m: 0,
            custo_unitario: Number(av.preco_referencia) || 5.0,
            preco_unitario_ult_compra: Number(av.preco_referencia) || 5.0,
            preco_venda_vigente: 0,
            ultima_compra_fornecedor: 'Produto Desejado',
            categoria_id: 7
          };

          const sAv = Number(rawSintetico.saldo) || 0;
          const vmdAv = Number(rawSintetico.vmd_ponderado) || 0;
          const v30Av = Number(rawSintetico.vendas_30d) || 0;
          const v10mAv = Number(rawSintetico.vendas_10m) || 0;

          candidatosFinais.unshift({
            raw: rawSintetico,
            vmd: vmdAv,
            saldo: sAv,
            vendas30d: v30Av,
            vendasHistorico6m: v10mAv,
            isEsquecido6m: false,
            diasCobertura: vmdAv > 0 && sAv > 0 ? Number((sAv / vmdAv).toFixed(1)) : (sAv <= 0 ? 0 : 99),
            chaveEq: null,
            equivalentesAgrupados: [],
            avulsoInfo: av
          });
        }
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

      const isArquivoImagemValido = (filePath) => {
        try {
          if (!fs.existsSync(filePath)) return false;
          const buf = fs.readFileSync(filePath);
          if (!buf || buf.length < 1200) return false;
          const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
          const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
          const isWebp = buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46;
          const isGif = buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46;
          return isJpeg || isPng || isWebp || isGif;
        } catch (e) {
          return false;
        }
      };

      const items = candidatosFinais.map(cand => {
        const { raw: r, vmd, saldo, vendas30d, vendasHistorico6m, isEsquecido6m, diasCobertura, chaveEq, equivalentesAgrupados, avulsoInfo } = cand;
        const ultCache = (r.produto_id && ultCompraByIdMap.get(Number(r.produto_id))) ||
          (r.ean && ultCompraByEanMap.get(String(r.ean).trim())) ||
          null;
        const custo = Number(ultCache?.preco_unitario_ult_compra) ||
          Number(r.preco_unitario_ult_compra) ||
          Number(r.custo_unitario) ||
          Number(avulsoInfo?.preco_referencia) ||
          0;

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
        const cotacoesSemEst = r.ean ? cotacoesSemEstoqueComPrecoMap[r.ean] : null;
        const jaConsultado = r.ean ? eansConsultadosSet.has(r.ean) : false;
        let fornecedor1 = '';
        let preco1 = 0;
        let urlProduto1 = null;
        let fornecedor2 = '';
        let preco2 = 0;
        let urlProduto2 = null;
        let fornecedor2Ref = null;
        let preco2Ref = 0;
        let diferencaPct = 0;

        if (cotacoesReais && cotacoesReais.length > 0) {
          fornecedor1 = cotacoesReais[0].fornecedor;
          preco1 = Number(cotacoesReais[0].preco.toFixed(2));
          urlProduto1 = cotacoesReais[0].url_produto || gerarUrlDistribuidoraProduto(fornecedor1, r.ean, r.descricao);

          if (cotacoesReais.length > 1) {
            fornecedor2 = cotacoesReais[1].fornecedor;
            preco2 = Number(cotacoesReais[1].preco.toFixed(2));
            urlProduto2 = cotacoesReais[1].url_produto || gerarUrlDistribuidoraProduto(fornecedor2, r.ean, r.descricao);
            diferencaPct = preco1 > 0 ? Number((((preco2 - preco1) / preco1) * 100).toFixed(1)) : 0;
          } else {
            fornecedor2 = '—';
            preco2 = 0;
            urlProduto2 = null;
            diferencaPct = 0;
            // Se houver um 2º portal cotado com preço registrado porém sem estoque no momento, expõe como referência
            if (Array.isArray(cotacoesSemEst) && cotacoesSemEst.length > 0) {
              const segRef = cotacoesSemEst.find(x => String(x.fornecedor).toUpperCase() !== String(fornecedor1).toUpperCase());
              if (segRef && Number(segRef.preco) > 0) {
                fornecedor2Ref = segRef.fornecedor;
                preco2Ref = Number(Number(segRef.preco).toFixed(2));
              }
            }
          }
        } else if (jaConsultado) {
          fornecedor1 = 'Sem Estoque (Portais)';
          preco1 = Number(custo.toFixed(2));
          urlProduto1 = null;
          fornecedor2 = '—';
          preco2 = 0;
          urlProduto2 = null;
          diferencaPct = 0;
        } else {
          fornecedor1 = 'Não Cotado';
          preco1 = Number(custo.toFixed(2));
          urlProduto1 = null;
          fornecedor2 = '—';
          preco2 = 0;
          urlProduto2 = null;
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

        const qtdSugerida7d = avulsoInfo
          ? Math.max(1, Number(avulsoInfo.quantidade) || 1)
          : (equalizarAtivo ? qtdEqualizada7d : qtdBruta7d);
        if (!avulsoInfo && qtdBruta7d > qtdEqualizada7d) {
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

        const regProd = (r.ean && regrasMap[r.ean]) || (r.produto_id && regrasMap[`ID_${r.produto_id}`]) || null;

        const isCurvaAlta = r.curva_abc === 'A' || r.curva_abc === 'B';
        let prioridade = 'P4';
        let prioridadeRotulo = 'Regular';
        if (avulsoInfo) {
          prioridade = 'P1';
          prioridadeRotulo = '⭐ Produto Desejado';
        } else if (saldo <= 0 && isCurvaAlta) {
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

        let fotoUrl = (r.ean && fotoEanMap.get(String(r.ean).trim())) || r.imagem_url || null;
        if (fotoUrl && fotoUrl.startsWith('/uploads/produtos/')) {
          const checkRel = path.join(__dirname, '..', 'public', fotoUrl);
          const checkBack = path.join(__dirname, fotoUrl);
          if (!isArquivoImagemValido(checkRel) && !isArquivoImagemValido(checkBack)) {
            fotoUrl = null;
          }
        }
        if (!fotoUrl && r.produto_id) {
          try {
            const pIdStr = String(r.produto_id);
            const candidates = [
              path.join(__dirname, '../public/uploads/produtos', `${pIdStr}.jpg`),
              path.join(__dirname, 'uploads/produtos', `${pIdStr}.jpg`),
              path.join(__dirname, '../public/uploads/produtos', `${pIdStr}.png`),
              path.join(__dirname, 'uploads/produtos', `${pIdStr}.png`)
            ];
            for (const cPath of candidates) {
              if (isArquivoImagemValido(cPath)) {
                const ext = cPath.endsWith('.png') ? 'png' : 'jpg';
                fotoUrl = `/uploads/produtos/${pIdStr}.${ext}`;
                break;
              }
            }
          } catch (e) {}
        }
        if (!fotoUrl && r.descricao) {
          const words = r.descricao.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 2);
          if (words.length >= 2) {
            const match = fotoNameList.find(n => n.key.includes(words[0]) && n.key.includes(words[1]));
            if (match) fotoUrl = match.url;
          } else if (words.length === 1 && words[0].length >= 5) {
            const match = fotoNameList.find(n => n.key.includes(words[0]));
            if (match) fotoUrl = match.url;
          }
        }

        const hojeIso = new Date().toISOString().slice(0, 10);
        const enviadoAte = regProd?.enviado_carrinho_ate || null;
        const isEnviadoCarrinhoSemana = Boolean(
          (enviadoAte && String(enviadoAte) >= hojeIso) ||
          (r.ean && eansNoCarrinhoSemanaSet.has(String(r.ean).trim()))
        );

        const fornUltFinal = (ultCache?.fornecedor_nome && String(ultCache.fornecedor_nome).trim()) ||
          (r.ultima_compra_fornecedor && String(r.ultima_compra_fornecedor).trim()) ||
          'Não registrado';
        const dataUltFinal = ultCache?.data_compra || r.ultima_compra_data || '';
        const nfUltFinal = ultCache?.numero_nota_fiscal || r.ultima_compra_nf || '';
        const qtdUltFinal = ultCache?.quantidade ? Number(ultCache.quantidade) : null;
        const embUltFinal = ultCache?.embalagem_detalhe || '';

        return {
          produto_id: r.produto_id,
          descricao: r.descricao,
          apresentacao: r.apresentacao || '',
          ean: r.ean || '',
          imagem_url: fotoUrl,
          curva_abc: r.curva_abc || 'C',
          prioridade: prioridade,
          prioridade_rotulo: prioridadeRotulo,
          is_desejado: Boolean(avulsoInfo),
          id_desejado: avulsoInfo ? avulsoInfo.id : null,
          motivo_desejado: avulsoInfo ? (avulsoInfo.motivo || 'Produto Desejado') : null,
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
          url_produto_2: urlProduto2,
          fornecedor_2_ref: fornecedor2Ref,
          preco_2_ref: preco2Ref,
          condicao_comercial_1: cotacoesReais && cotacoesReais[0] ? (cotacoesReais[0].condicao_comercial || null) : null,
          preco_padrao_1: cotacoesReais && cotacoesReais[0] ? (cotacoesReais[0].preco_padrao || null) : null,
          is_generico_mais_barato_1: Boolean(cotacoesReais && cotacoesReais[0] && cotacoesReais[0].is_generico_mais_barato),
          ean_substituto_1: cotacoesReais && cotacoesReais[0] ? (cotacoesReais[0].ean_substituto || null) : null,
          laboratorio_1: cotacoesReais && cotacoesReais[0] ? (cotacoesReais[0].laboratorio || null) : null,
          is_substituto_1: Boolean(cotacoesReais && cotacoesReais[0] && cotacoesReais[0].is_substituto),
          todos_concorrentes_1: cotacoesReais && cotacoesReais[0] && cotacoesReais[0].todos_concorrentes ? JSON.parse(cotacoesReais[0].todos_concorrentes) : [],
          condicao_comercial_2: cotacoesReais && cotacoesReais[1] ? (cotacoesReais[1].condicao_comercial || null) : null,
          preco_padrao_2: cotacoesReais && cotacoesReais[1] ? (cotacoesReais[1].preco_padrao || null) : null,
          diferenca_percentual: diferencaPct,
          todas_cotacoes_reais: Array.isArray(cotacoesReais)
            ? cotacoesReais.map(cr => ({
                distribuidora: cr.fornecedor,
                preco: Number(cr.preco) || 0,
                url_produto: cr.url_produto || null,
                condicao_comercial: cr.condicao_comercial || null,
                ean_substituto: cr.ean_substituto || null,
                laboratorio: cr.laboratorio || null,
                is_substituto: Boolean(cr.is_substituto),
                todos_concorrentes: cr.todos_concorrentes ? JSON.parse(cr.todos_concorrentes) : []
              }))
            : [],

          fornecedor_ult_compra: fornUltFinal,
          data_ult_compra: dataUltFinal,
          nf_ult_compra: nfUltFinal,
          qtd_ult_compra: qtdUltFinal,
          embalagem_ult_compra: embUltFinal,
          qtd_bruta_7d: qtdBruta7d,
          qtd_equalizada_7d: qtdEqualizada7d,
          qtd_sugerida_7d: qtdSugerida7d,
          subtotal_7d: subtotal7d,
          tipo_categoria: isMedicamento ? 'MEDICAMENTO' : 'PERFUMARIA',
          nao_cotar: Boolean(regProd?.nao_cotar),
          nao_carrinho: Boolean(regProd?.nao_carrinho),
          motivo_justificativa: regProd?.motivo_justificativa || '',
          adiar_ate: regProd?.adiar_ate || null,
          is_adiado_proxima_semana: Boolean(regProd?.adiar_ate && String(regProd.adiar_ate) >= hojeIso),
          enviado_carrinho_ate: enviadoAte,
          is_enviado_carrinho_semana: isEnviadoCarrinhoSemana,
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

      // Sistema de Rankeamento Estratégico: Primeiras posições para Produtos Desejados e Alto Giro + Risco de Ruptura
      const pesoPrioridade = { P1: 1, P2: 2, P3: 3, P4: 4 };
      items.forEach(it => {
        const bonusDesejado = it.is_desejado ? 2500 : 0;
        const bonusCurva = it.curva_abc === 'A' ? 400 : it.curva_abc === 'B' ? 200 : 50;
        const bonusRuptura = it.saldo <= 0 ? 500 : Math.max(0, 300 - (Number(it.dias_estoque_restante || 0) * 35));
        const bonusGiro = (Number(it.vmd_ponderado || 0) * 120) + (Number(it.vendas_30d || 0) * 6);
        const bonusBalcao = it.falta_balcao_belinha ? 250 : 0;
        it.score_ranking = Math.round(bonusDesejado + bonusCurva + bonusRuptura + bonusGiro + bonusBalcao);
      });

      items.sort((a, b) => {
        if (a.is_desejado && !b.is_desejado) return -1;
        if (!a.is_desejado && b.is_desejado) return 1;
        const pa = pesoPrioridade[a.prioridade] || 4;
        const pb = pesoPrioridade[b.prioridade] || 4;
        if (pa !== pb) return pa - pb;
        if (b.score_ranking !== a.score_ranking) return b.score_ranking - a.score_ranking;
        if (a.saldo <= 0 && b.saldo > 0) return -1;
        if (b.saldo <= 0 && a.saldo > 0) return 1;
        return (b.vmd_ponderado || 0) - (a.vmd_ponderado || 0);
      });

      items.forEach((it, idx) => {
        it.ranking_posicao = idx + 1;
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

      // Enriquecer lista de avulsos (Produtos Desejados) com as cotações e estoque atuais
      const avulsosEnriquecidos = avulsos.map(av => {
        const itemCorrespondente = items.find(it => it.id_desejado === av.id || (av.ean && it.ean === av.ean));
        return {
          ...av,
          saldo: itemCorrespondente ? itemCorrespondente.saldo : 0,
          vendas_30d: itemCorrespondente ? itemCorrespondente.vendas_30d : 0,
          vendas_10m: itemCorrespondente ? itemCorrespondente.vendas_historico_6m : 0,
          fornecedor_1: itemCorrespondente ? itemCorrespondente.fornecedor_1 : 'Não Cotado',
          preco_1: itemCorrespondente ? itemCorrespondente.preco_1 : Number(av.preco_referencia) || 0,
          fornecedor_2: itemCorrespondente ? itemCorrespondente.fornecedor_2 : '—',
          preco_2: itemCorrespondente ? itemCorrespondente.preco_2 : 0,
          produto_id_tabela: itemCorrespondente ? itemCorrespondente.produto_id : av.produto_id
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
        itens_avulsos: avulsosEnriquecidos,
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
   * Permite gravar ou atualizar 1 Produto Desejado na cotação (evita duplicatas por EAN/produto_id)
   */
  router.post('/itens-avulsos', (req, res) => {
    try {
      const { produto_id, descricao, ean, quantidade, preco_referencia, motivo, usuario } = req.body;

      if (!descricao || !quantidade) {
        return res.status(400).json({ success: false, error: 'Descrição e quantidade são obrigatórios.' });
      }

      const eanClean = ean ? String(ean).trim() : null;
      const descClean = String(descricao).toUpperCase().trim();
      const qtdNum = Math.max(1, Number(quantidade) || 1);

      const existente = db.prepare(`
        SELECT id FROM belaped_itens_avulsos
        WHERE (ean IS NOT NULL AND ean != '' AND ean = ?)
           OR (produto_id IS NOT NULL AND produto_id = ?)
           OR UPPER(descricao) = ?
      `).get(eanClean || '__NONE__', produto_id || -999999, descClean);

      if (existente) {
        db.prepare(`
          UPDATE belaped_itens_avulsos
          SET quantidade = ?, preco_referencia = COALESCE(?, preco_referencia), motivo = COALESCE(?, motivo)
          WHERE id = ?
        `).run(qtdNum, Number(preco_referencia) || null, motivo || 'Produto Desejado', existente.id);
        return res.json({ success: true, id: existente.id, updated: true, message: 'Quantidade do Produto Desejado atualizada na cotação!' });
      }

      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO belaped_itens_avulsos (id, produto_id, descricao, ean, quantidade, preco_referencia, motivo, adicionado_por)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        produto_id || null,
        descClean,
        eanClean,
        qtdNum,
        Number(preco_referencia) || 0,
        motivo || 'Produto Desejado',
        usuario || 'Operador'
      );

      res.json({ success: true, id, message: 'Produto gravado nos Produtos Desejados e incluído na cotação!' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/belaped/itens-avulsos/lote
   * Permite gravar vários Produtos Desejados de uma só vez (ex: selecionando várias tintas Maxton na pesquisa)
   */
  router.post('/itens-avulsos/lote', (req, res) => {
    try {
      const { itens, usuario } = req.body || {};
      if (!Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ success: false, error: 'Envie ao menos 1 produto para gravar.' });
      }

      let adicionados = 0;
      let atualizados = 0;

      const tx = db.transaction(() => {
        for (const it of itens) {
          if (!it.descricao) continue;
          const eanClean = it.ean ? String(it.ean).trim() : null;
          const descClean = String(it.descricao).toUpperCase().trim();
          const qtdNum = Math.max(1, Number(it.quantidade) || 1);
          const precoRef = Number(it.preco_referencia || it.preco_ult_compra || it.custo_unitario || 5.0);

          const existente = db.prepare(`
            SELECT id FROM belaped_itens_avulsos
            WHERE (ean IS NOT NULL AND ean != '' AND ean = ?)
               OR (produto_id IS NOT NULL AND produto_id = ?)
               OR UPPER(descricao) = ?
          `).get(eanClean || '__NONE__', it.produto_id || -999999, descClean);

          if (existente) {
            db.prepare(`
              UPDATE belaped_itens_avulsos
              SET quantidade = ?, preco_referencia = ?
              WHERE id = ?
            `).run(qtdNum, precoRef, existente.id);
            atualizados++;
          } else {
            db.prepare(`
              INSERT INTO belaped_itens_avulsos (id, produto_id, descricao, ean, quantidade, preco_referencia, motivo, adicionado_por)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              crypto.randomUUID(),
              it.produto_id || null,
              descClean,
              eanClean,
              qtdNum,
              precoRef,
              it.motivo || 'Produto Desejado (Seleção em Lote)',
              usuario || 'Comprador'
            );
            adicionados++;
          }
        }
      });
      tx();

      res.json({
        success: true,
        adicionados,
        atualizados,
        total: adicionados + atualizados,
        message: `${adicionados + atualizados} produto(s) gravado(s) nos Produtos Desejados e incluído(s) na cotação!`
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * PUT /api/belaped/itens-avulsos/:id
   * Atualiza a quantidade desejada de um Produto Desejado
   */
  router.put('/itens-avulsos/:id', (req, res) => {
    try {
      const { id } = req.params;
      const { quantidade, motivo } = req.body || {};
      const qtdNum = Math.max(1, Number(quantidade) || 1);
      db.prepare(`
        UPDATE belaped_itens_avulsos
        SET quantidade = ?, motivo = COALESCE(?, motivo)
        WHERE id = ?
      `).run(qtdNum, motivo || null, id);
      res.json({ success: true });
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
   * GET /api/belaped/produtos-regras
   * Retorna todas as regras ativas de bloqueio de carrinho ou bloqueio de cotação com justificativa
   */
  router.get('/produtos-regras', (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT chave_regra, ean, produto_id, descricao, nao_cotar, nao_carrinho, motivo_justificativa, atualizado_por, atualizado_em
        FROM belaped_produtos_regras
        ORDER BY atualizado_em DESC
      `).all();
      res.json({ success: true, regras: rows });
    } catch (err) {
      console.error('[BelaPed] Erro ao listar regras de produtos:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/belaped/produtos-regras
   * Salva ou atualiza a preferência do produto (não cotar, não colocar no carrinho, justificativa)
   */
  router.post('/produtos-regras', (req, res) => {
    try {
      const { ean, produto_id, descricao, nao_cotar, nao_carrinho, motivo_justificativa, adiar_ate, usuario } = req.body;
      const eanLimpo = String(ean || '').trim();
      const pidNum = produto_id ? Number(produto_id) : null;
      const chaveRegra = eanLimpo || (pidNum ? `ID_${pidNum}` : null);

      if (!chaveRegra) {
        return res.status(400).json({ success: false, error: 'EAN ou produto_id é obrigatório.' });
      }

      const stmt = db.prepare(`
        INSERT INTO belaped_produtos_regras (chave_regra, ean, produto_id, descricao, nao_cotar, nao_carrinho, motivo_justificativa, adiar_ate, atualizado_por, atualizado_em)
        VALUES (@chave_regra, @ean, @produto_id, @descricao, @nao_cotar, @nao_carrinho, @motivo_justificativa, @adiar_ate, @atualizado_por, datetime('now', 'localtime'))
        ON CONFLICT(chave_regra) DO UPDATE SET
          ean = COALESCE(excluded.ean, belaped_produtos_regras.ean),
          produto_id = COALESCE(excluded.produto_id, belaped_produtos_regras.produto_id),
          descricao = COALESCE(excluded.descricao, belaped_produtos_regras.descricao),
          nao_cotar = excluded.nao_cotar,
          nao_carrinho = excluded.nao_carrinho,
          motivo_justificativa = excluded.motivo_justificativa,
          adiar_ate = excluded.adiar_ate,
          atualizado_por = excluded.atualizado_por,
          atualizado_em = excluded.atualizado_em
      `);

      stmt.run({
        chave_regra: chaveRegra,
        ean: eanLimpo || null,
        produto_id: pidNum,
        descricao: descricao || '',
        nao_cotar: nao_cotar ? 1 : 0,
        nao_carrinho: nao_carrinho ? 1 : 0,
        motivo_justificativa: String(motivo_justificativa || '').trim(),
        adiar_ate: adiar_ate ? String(adiar_ate).trim() : null,
        atualizado_por: usuario || 'Farmacêutico/Gestor'
      });

      res.json({
        success: true,
        message: 'Regra de produto salva com sucesso!',
        regra: {
          chave_regra: chaveRegra,
          ean: eanLimpo,
          produto_id: pidNum,
          nao_cotar: Boolean(nao_cotar),
          nao_carrinho: Boolean(nao_carrinho),
          motivo_justificativa: String(motivo_justificativa || '').trim(),
          adiar_ate: adiar_ate || null
        }
      });
    } catch (err) {
      console.error('[BelaPed] Erro ao salvar regra do produto:', err.message);
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
   * GET /api/belaped/portais/:portal/sugestoes-curva-a
   * Consulta compras_estoque_cache onde curva_abc = 'A' e saldo <= 0,
   * cruzado com belaped_cotacoes_reais cr (disponivel = 1, preco > 0, fornecedor do portal),
   * ordenado por vmd_ponderado DESC. Sugere quantidades para cobrir a falta.
   */
  router.get('/portais/:portal/sugestoes-curva-a', (req, res) => {
    try {
      const portalParam = req.params.portal;
      const falta = Math.max(0, parseFloat(req.query.falta) || 0);

      // Normaliza / resolve nome da distribuidora
      let fornecedorNome = portalParam;
      const portalRow = db.prepare(`
        SELECT id, nome, pedido_minimo FROM belaped_portais 
        WHERE id = lower(?) OR upper(nome) = upper(?) OR upper(nome) LIKE ?
      `).get(portalParam, portalParam, `%${portalParam.toUpperCase()}%`);

      if (portalRow) {
        fornecedorNome = portalRow.nome;
      }

      const query = `
        SELECT 
          c.produto_id,
          c.descricao,
          c.apresentacao,
          c.ean,
          c.curva_abc,
          c.saldo,
          c.vmd_ponderado,
          c.est_minimo_calculado,
          c.custo_unitario,
          cr.preco as preco_portal,
          cr.fornecedor,
          cr.url_produto
        FROM compras_estoque_cache c
        INNER JOIN belaped_cotacoes_reais cr ON cr.ean = c.ean AND cr.disponivel = 1 AND cr.preco > 0
        WHERE c.curva_abc = 'A'
          AND c.saldo <= 0
          AND (UPPER(cr.fornecedor) = UPPER(?) OR UPPER(cr.fornecedor) = UPPER(?))
        ORDER BY c.vmd_ponderado DESC
        LIMIT 30
      `;

      const candidatos = db.prepare(query).all(portalParam, fornecedorNome);

      let acumulado = 0;
      const sugestoes = [];

      for (const item of candidatos) {
        const preco = Number(item.preco_portal);
        if (preco <= 0) continue;
        const vmd = Number(item.vmd_ponderado || 0);
        // Quantidade sugerida: 7 dias de giro (mínimo 1 un, teto prudencial 20 un)
        const qtdSugerida = Math.max(1, Math.min(20, Math.ceil(vmd * 7)));
        const subtotal = Number((qtdSugerida * preco).toFixed(2));

        sugestoes.push({
          ...item,
          qtd_sugerida: qtdSugerida,
          subtotal
        });

        acumulado += subtotal;
        if (falta > 0 && acumulado >= falta) {
          break;
        }
      }

      res.json({
        success: true,
        portal: portalRow ? portalRow.id : portalParam,
        fornecedor: fornecedorNome,
        falta,
        totalSugerido: Number(acumulado.toFixed(2)),
        sugestoes
      });
    } catch (err) {
      console.error('[BelaPed] Erro em sugestoes-curva-a:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/belaped/portais
   * Cria ou edita um portal de distribuidora
   */
  router.post('/portais', (req, res) => {
    try {
      const { id, nome, url_portal, usuario, senha_enc, pedido_minimo, prazo_dias_padrao, prazos_boleto, uf_origem, is_ativo, observacoes } = req.body;

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
              pedido_minimo = ?, prazo_dias_padrao = ?, prazos_boleto = COALESCE(?, prazos_boleto),
              uf_origem = ?, is_mg = ?, is_ativo = ?, observacoes = ?
          WHERE id = ?
        `).run(
          nome.toUpperCase().trim(),
          url_portal.trim(),
          usuario || '',
          senha_enc || null,
          Number(pedido_minimo) || 350.0,
          Number(prazo_dias_padrao) || 28,
          prazos_boleto !== undefined ? prazos_boleto : null,
          (uf_origem || 'MG').toUpperCase().trim(),
          isMg,
          is_ativo !== undefined ? (is_ativo ? 1 : 0) : 1,
          observacoes || '',
          portalId
        );
      } else {
        db.prepare(`
          INSERT INTO belaped_portais (id, nome, url_portal, usuario, senha_enc, pedido_minimo, prazo_dias_padrao, prazos_boleto, uf_origem, is_mg, is_ativo, observacoes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          portalId,
          nome.toUpperCase().trim(),
          url_portal.trim(),
          usuario || '',
          senha_enc || '',
          Number(pedido_minimo) || 350.0,
          Number(prazo_dias_padrao) || 28,
          prazos_boleto || null,
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
   * GET /api/belaped/distrimed-campanhas
   * Retorna todas as campanhas comerciais cadastradas para a Distrimed
   */
  router.get('/distrimed-campanhas', (req, res) => {
    try {
      const campanhas = db.prepare('SELECT * FROM belaped_distrimed_campanhas ORDER BY ativo DESC, nome_opcao ASC').all();
      res.json({ success: true, campanhas });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/belaped/distrimed-campanhas
   * Adiciona ou atualiza uma campanha da Distrimed
   */
  router.post('/distrimed-campanhas', (req, res) => {
    try {
      const { id, nome_opcao, termos_busca, minimo_valor, minimo_qtd, ativo } = req.body;
      if (!nome_opcao || !termos_busca) {
        return res.status(400).json({ success: false, error: 'Nome da opção e termos de busca são obrigatórios.' });
      }

      if (id) {
        db.prepare(`
          UPDATE belaped_distrimed_campanhas
          SET nome_opcao = ?, termos_busca = ?, minimo_valor = ?, minimo_qtd = ?, ativo = ?
          WHERE id = ?
        `).run(
          nome_opcao.trim().toUpperCase(),
          termos_busca.trim().toUpperCase(),
          Number(minimo_valor) || 0,
          Number(minimo_qtd) || 0,
          ativo !== undefined ? (ativo ? 1 : 0) : 1,
          id
        );
      } else {
        db.prepare(`
          INSERT INTO belaped_distrimed_campanhas (nome_opcao, termos_busca, minimo_valor, minimo_qtd, ativo)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          nome_opcao.trim().toUpperCase(),
          termos_busca.trim().toUpperCase(),
          Number(minimo_valor) || 0,
          Number(minimo_qtd) || 0,
          ativo !== undefined ? (ativo ? 1 : 0) : 1
        );
      }

      res.json({ success: true, message: 'Campanha da Distrimed salva com sucesso!' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * DELETE /api/belaped/distrimed-campanhas/:id
   * Remove uma campanha da Distrimed
   */
  router.delete('/distrimed-campanhas/:id', (req, res) => {
    try {
      db.prepare('DELETE FROM belaped_distrimed_campanhas WHERE id = ?').run(req.params.id);
      res.json({ success: true, message: 'Campanha removida com sucesso!' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/belaped/auditoria-prazos
   * Retorna os últimos registros de auditoria segura de prazos de boletos e pedidos mínimos
   */
  router.get('/auditoria-prazos', (req, res) => {
    try {
      const historico = db.prepare(`
        SELECT * FROM belaped_portais_auditoria_prazos 
        ORDER BY id DESC LIMIT 50
      `).all();

      const resumoPortais = db.prepare(`
        SELECT id, nome, pedido_minimo, prazo_dias_padrao, prazos_boleto, data_ultima_auditoria, is_ativo 
        FROM belaped_portais
        ORDER BY nome ASC
      `).all();

      res.json({ success: true, historico, resumoPortais });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/belaped/auditar-prazos
   * Dispara a simulação segura de prazos de boletos e pedidos mínimos com preservação total de carrinhos
   */
  router.post('/auditar-prazos', async (req, res) => {
    try {
      const { portal } = req.body; // se especificado, audita só um portal; se omitido, audita todos
      if (portal) {
        const resultado = await auditarPortalSeguro(portal, null, db);
        return res.json({ success: true, resultado });
      } else {
        // Dispara em background para não travar a requisição HTTP longa
        auditarTodasDistribuidoras(db).then(resultados => {
          console.log('[AuditoriaPrazos] Auditoria quinzenal concluída com sucesso:', resultados.length, 'portais.');
        }).catch(err => {
          console.error('[AuditoriaPrazos] Erro na auditoria em background:', err.message);
        });

        return res.json({
          success: true,
          message: 'Rotina de auditoria segura de prazos iniciada em segundo plano para todas as distribuidoras.'
        });
      }
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
  /**
   * Extrai os dias numéricos de uma string de prazos de boletos
   * Ex: "À Vista | 21 DDL | 28 DDL | 28/35 DDL | 28/35/42 DDL | 30/60 DDL" -> [0, 21, 28, 35, 42, 60]
   */
  function extrairDiasDePrazos(prazosStr, prazoPadrao = 28) {
    if (!prazosStr) return [Number(prazoPadrao) || 28];
    const dias = new Set();
    const strUpper = String(prazosStr).toUpperCase();
    if (strUpper.includes('À VISTA') || strUpper.includes('A VISTA') || strUpper.includes('AVISTA')) {
      dias.add(0);
    }
    const matches = prazosStr.match(/\d+/g);
    if (matches) {
      matches.forEach(m => dias.add(Number(m)));
    }
    if (dias.size === 0) dias.add(Number(prazoPadrao) || 28);
    return Array.from(dias).sort((a, b) => a - b);
  }

  /**
   * Avalia se uma distribuidora cumpre o filtro de prazo desejado
   */
  function avaliarElegibilidadePortalPorPrazo(portal, alvoVencimento = 'AUTOMATICO', diasMinimosRecomendados = 0) {
    const prazosStr = portal.prazos_boleto || `${portal.prazo_dias_padrao || 28} DDL`;
    const dias = extrairDiasDePrazos(prazosStr, portal.prazo_dias_padrao);
    const maxDia = Math.max(...dias);

    // Se sem restrição
    if (!alvoVencimento || alvoVencimento === 'TODOS') {
      const opcoes = prazosStr.split(' | ');
      return {
        elegivel: true,
        prazoEleito: opcoes[opcoes.length - 1] || `${maxDia} DDL`,
        diasEleitos: maxDia,
        motivo: 'Sem restrição de prazo (Apenas Menor Preço)'
      };
    }

    // Próximo Mês: exige que a distribuidora conceda boletos com pelo menos 28 dias
    if (alvoVencimento === 'PROXIMO_MES') {
      const diasProximoMes = dias.filter(d => d >= 28);
      if (diasProximoMes.length > 0) {
        const diaEleito = Math.max(...diasProximoMes);
        const opcaoTexto = (portal.prazos_boleto || '').split(' | ').find(o => o.includes(String(diaEleito))) || `${diaEleito} DDL`;
        return {
          elegivel: true,
          prazoEleito: opcaoTexto.trim(),
          diasEleitos: diaEleito,
          motivo: 'Compatível com vencimento no próximo mês'
        };
      }
      return {
        elegivel: false,
        prazoEleito: null,
        diasEleitos: 0,
        motivo: `Distribuidora não oferece boletos para o próximo mês (Maior prazo: ${maxDia}d)`
      };
    }

    // Prazo Longo (60d+): exige boletos de 45 dias ou mais
    if (alvoVencimento === 'LONGO') {
      const diasLongos = dias.filter(d => d >= 45);
      if (diasLongos.length > 0) {
        const diaEleito = Math.max(...diasLongos);
        const opcaoTexto = (portal.prazos_boleto || '').split(' | ').find(o => o.includes(String(diaEleito))) || `${diaEleito} DDL`;
        return {
          elegivel: true,
          prazoEleito: opcaoTexto.trim(),
          diasEleitos: diaEleito,
          motivo: 'Compatível com prazo longo (45d a 60d+)'
        };
      }
      return {
        elegivel: false,
        prazoEleito: null,
        diasEleitos: 0,
        motivo: `Distribuidora não oferece prazos longos de 45d+ (Maior prazo: ${maxDia}d)`
      };
    }

    // Automático (Saldo do Orçamento)
    if (alvoVencimento === 'AUTOMATICO') {
      const exigido = diasMinimosRecomendados > 0 ? diasMinimosRecomendados : 28;
      const diasValidos = dias.filter(d => d >= exigido);
      if (diasValidos.length > 0) {
        const diaEleito = Math.max(...diasValidos);
        const opcaoTexto = (portal.prazos_boleto || '').split(' | ').find(o => o.includes(String(diaEleito))) || `${diaEleito} DDL`;
        return {
          elegivel: true,
          prazoEleito: opcaoTexto.trim(),
          diasEleitos: diaEleito,
          motivo: `Compatível com a folga do orçamento (${diaEleito}d >= ${exigido}d)`
        };
      }
      return {
        elegivel: false,
        prazoEleito: null,
        diasEleitos: 0,
        motivo: `Prazo insuficiente para a folga orçamentária do mês (Exigido: >= ${exigido}d, Oferece: ${maxDia}d)`
      };
    }

    return {
      elegivel: true,
      prazoEleito: `${maxDia} DDL`,
      diasEleitos: maxDia,
      motivo: 'Padrão'
    };
  }

  /**
   * Calcula a melhor divisão de boletos para a DISTRIMED segundo sua regra de negócio:
   * - Opção "Escolher o vencimento" com prazo máximo de 60 dias.
   * - Divide o valor total em parcelas de até R$ 250,00.
   * - Seleciona os meses que possuem saldo no orçamento e os dias úteis com MENOR fluxo de despesas (boletos + contas fixas) no Belinha.
   */
  function calcularParcelasDistrimedMenorDespesa(valorTotalCompra) {
    const total = Math.max(0, Number(valorTotalCompra) || 0);
    if (total <= 0) {
      return {
        opcaoLabel: 'Escolher Vencimento (Até 60 DDL)',
        resumoDatas: '',
        qtdParcelas: 1,
        parcelas: []
      };
    }

    const qtdParcelas = Math.max(1, Math.ceil(total / 250));
    const valorBase = Math.floor((total / qtdParcelas) * 100) / 100;

    const hoje = new Date();
    hoje.setHours(12, 0, 0, 0);

    // 1. Carrega limites de orçamento e gastos por mês (YYYY-MM)
    const limitesMap = {};
    const gastosMesMap = {};
    try {
      const rowsLim = db.prepare('SELECT month, year, "limit" FROM monthly_limits').all();
      rowsLim.forEach(r => {
        const key = `${r.year}-${String(r.month).padStart(2, '0')}`;
        limitesMap[key] = Number(r.limit) || 12500;
      });
    } catch (e) {}

    // 2. Carrega boletos pendentes por data (YYYY-MM-DD) e soma por mês
    const despesasDiaMap = {};
    try {
      const rowsBol = db.prepare(`
        SELECT due_date, value FROM boletos
        WHERE LOWER(COALESCE(status, '')) NOT IN ('cancelado', 'rejeitado')
      `).all();
      rowsBol.forEach(b => {
        const dStr = String(b.due_date || '').slice(0, 10);
        if (!dStr) return;
        const val = Number(b.value) || 0;
        despesasDiaMap[dStr] = (despesasDiaMap[dStr] || 0) + val;
        const ym = dStr.slice(0, 7);
        gastosMesMap[ym] = (gastosMesMap[ym] || 0) + val;
      });
    } catch (e) {}

    // 3. Carrega contas fixas ativas por dia do mês (dueDay)
    const contasFixasDiaMes = {};
    let totalFixasMensal = 0;
    try {
      const rowsFix = db.prepare('SELECT dueDay, value FROM fixed_accounts WHERE isActive = 1').all();
      rowsFix.forEach(f => {
        const dia = Number(f.dueDay) || 1;
        const val = Number(f.value) || 0;
        contasFixasDiaMes[dia] = (contasFixasDiaMes[dia] || 0) + val;
        totalFixasMensal += val;
      });
    } catch (e) {}

    // 4. Gera candidatos de dias úteis entre D+14 e D+60 (respeitando máximo de 60 dias da Distrimed)
    const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const diasCandidatos = [];

    for (let d = 14; d <= 60; d++) {
      const dt = new Date(hoje.getTime() + d * 86400000);
      const dow = dt.getDay();
      if (dow === 0 || dow === 6) continue; // Apenas dias úteis (Seg a Sex)

      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      const dateKey = `${yyyy}-${mm}-${dd}`;
      const ymKey = `${yyyy}-${mm}`;

      const limiteMes = limitesMap[ymKey] || 12500;
      const gastoAtualMes = (gastosMesMap[ymKey] || 0);
      const saldoLivreMes = limiteMes - gastoAtualMes;
      const temOrcamentoMes = saldoLivreMes >= valorBase;

      const despesaBoletosDia = despesasDiaMap[dateKey] || 0;
      const despesaFixaDia = contasFixasDiaMes[dt.getDate()] || 0;
      const despesaTotalDia = Number((despesaBoletosDia + despesaFixaDia).toFixed(2));

      diasCandidatos.push({
        diasCorridos: d,
        dueDate: dateKey,
        dataBR: `${dd}/${mm}/${yyyy}`,
        dataCurta: `${dd}/${mm}`,
        ymKey,
        nomeMes: nomesMeses[dt.getMonth()],
        temOrcamentoMes,
        saldoLivreMes: Number(saldoLivreMes.toFixed(2)),
        despesaTotalDia
      });
    }

    // 5. Ordena os dias: 1º Mês com saldo no orçamento, 2º Menor despesa no dia, 3º Maior prazo
    const ordenados = [...diasCandidatos].sort((a, b) => {
      if (a.temOrcamentoMes !== b.temOrcamentoMes) {
        return a.temOrcamentoMes ? -1 : 1;
      }
      if (a.despesaTotalDia !== b.despesaTotalDia) {
        return a.despesaTotalDia - b.despesaTotalDia;
      }
      return b.diasCorridos - a.diasCorridos;
    });

    // 6. Seleciona as N datas mantendo espaçamento mínimo entre parcelas (ex: >= 5 dias quando possível)
    const escolhidos = [];
    for (const cand of ordenados) {
      if (escolhidos.length >= qtdParcelas) break;
      const muitoPerto = escolhidos.some(e => Math.abs(e.diasCorridos - cand.diasCorridos) < 5);
      if (!muitoPerto) {
        escolhidos.push(cand);
      }
    }
    // Fallback se qtdParcelas for grande e precisar de espaçamento menor
    if (escolhidos.length < qtdParcelas) {
      for (const cand of ordenados) {
        if (escolhidos.length >= qtdParcelas) break;
        if (!escolhidos.some(e => e.dueDate === cand.dueDate)) {
          escolhidos.push(cand);
        }
      }
    }

    // Ordena cronologicamente as parcelas escolhidas
    escolhidos.sort((a, b) => a.diasCorridos - b.diasCorridos);

    const parcelas = escolhidos.map((esc, idx) => {
      const isUltima = idx === escolhidos.length - 1;
      const valorParcela = isUltima
        ? Number((total - valorBase * (escolhidos.length - 1)).toFixed(2))
        : Number(valorBase.toFixed(2));
      return {
        numero: idx + 1,
        valor: valorParcela,
        dueDate: esc.dueDate,
        dataBR: esc.dataBR,
        dataCurta: esc.dataCurta,
        diasCorridos: esc.diasCorridos,
        despesaNoDia: esc.despesaTotalDia,
        nomeMes: esc.nomeMes,
        temOrcamentoMes: esc.temOrcamentoMes
      };
    });

    const resumoDatas = parcelas.map(p => `${p.dataCurta} (R$ ${p.valor.toFixed(2)})`).join(' • ');
    const diasStr = parcelas.map(p => p.diasCorridos).join('/');
    const opcaoLabel = `Escolher Vencimento (${parcelas.length}x ≤ R$ 250 • ${diasStr} DDL)`;

    return {
      opcaoLabel,
      resumoDatas,
      qtdParcelas: parcelas.length,
      parcelas
    };
  }

  /**
   * GET /api/belaped/distrimed-vencimentos?valorTotal=600
   * Retorna o plano de vencimentos inteligente da Distrimed (até 60d, parcelas <= R$ 250 nos dias de menor despesa)
   */
  router.get('/distrimed-vencimentos', (req, res) => {
    try {
      const valorTotal = Number(req.query.valorTotal) || 350;
      const plano = calcularParcelasDistrimedMenorDespesa(valorTotal);
      res.json({ success: true, plano });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/belaped/simular-otimizacao
   * Executa a otimização matemática e financeira considerando:
   * 1. Preços reais cotados em todos os 7 portais (belaped_cotacoes_reais)
   * 2. Menor preço entre distribuidoras elegíveis (com prazo no mês com saldo)
   * 3. Repasse automático de itens das empresas que NÃO atingiram o pedido mínimo para as demais empresas
   * 4. Regra de negócio da Distrimed (Escolher Vencimento em até 60d, parcelas <= R$ 250 nos dias de menor despesa)
   */
  router.post('/simular-otimizacao', (req, res) => {
    try {
      const { itens, cotacoesPorDistribuidora, alvoVencimento = 'AUTOMATICO' } = req.body;

      if (!itens || !Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ success: false, error: 'Lista de itens vazia para simulação.' });
      }

      // 1. Busca portais cadastrados
      const portais = db.prepare('SELECT * FROM belaped_portais WHERE is_ativo = 1').all();
      const portaisMap = {};
      portais.forEach(p => {
        portaisMap[p.nome.toUpperCase()] = p;
      });

      // 1.1 Busca TODAS as cotações reais diretamente do banco para garantir preços 100% reais
      const cotacoesBancoPorEan = {};
      try {
        const rowsCotReais = db.prepare(`
          SELECT ean, fornecedor, preco, url_produto, condicao_comercial, ean_substituto, laboratorio, is_substituto, todos_concorrentes
          FROM belaped_cotacoes_reais
          WHERE disponivel = 1 AND preco > 0
          ORDER BY preco ASC
        `).all();
        rowsCotReais.forEach(r => {
          const k = String(r.ean || '').trim();
          if (!k) return;
          if (!cotacoesBancoPorEan[k]) cotacoesBancoPorEan[k] = [];
          if (!cotacoesBancoPorEan[k].some(x => x.distribuidora.toUpperCase() === String(r.fornecedor).toUpperCase())) {
            cotacoesBancoPorEan[k].push({
              distribuidora: String(r.fornecedor).toUpperCase(),
              preco: Number(r.preco),
              url_produto: r.url_produto || null,
              condicao_comercial: r.condicao_comercial || null,
              ean_substituto: r.ean_substituto || null,
              laboratorio: r.laboratorio || null,
              is_substituto: Boolean(r.is_substituto),
              todos_concorrentes: r.todos_concorrentes ? JSON.parse(r.todos_concorrentes) : []
            });
          }
        });
      } catch (e) {
        console.warn('[BelaPed] Aviso ao ler belaped_cotacoes_reais em simular-otimizacao:', e.message);
      }

      // 2. Descobre dias mínimos recomendados pelo orçamento real (caso AUTOMATICO)
      let diasMinimosRecomendados = 0;
      let statusOrcamentoMesAtual = 'LIBERADO';
      try {
        const hoje = new Date();
        const mesAtual = hoje.getMonth() + 1;
        const anoAtual = hoje.getFullYear();
        const mesStr = String(mesAtual).padStart(2, '0');
        const prefixoData = `${anoAtual}-${mesStr}`;

        let limiteMesAtual = 12500.0;
        try {
          const ml = db.prepare(`SELECT "limit" FROM monthly_limits WHERE month = ? AND year = ?`).get(mesAtual, anoAtual);
          if (ml && ml.limit) limiteMesAtual = Number(ml.limit);
        } catch (e) {}

        const boletosMes = db.prepare(`
          SELECT value FROM boletos 
          WHERE due_date LIKE ? AND LOWER(COALESCE(status, '')) NOT IN ('cancelado', 'rejeitado')
        `).all(`${prefixoData}%`);

        const totalBoletosMes = boletosMes.reduce((acc, b) => acc + (Number(b.value) || 0), 0);
        if (totalBoletosMes >= limiteMesAtual) {
          statusOrcamentoMesAtual = 'ESTOURADO';
          const totalDiasNoMes = new Date(anoAtual, mesAtual, 0).getDate();
          diasMinimosRecomendados = (totalDiasNoMes - hoje.getDate()) + 2;
        } else if (totalBoletosMes >= limiteMesAtual * 0.8) {
          statusOrcamentoMesAtual = 'ALERTA';
          diasMinimosRecomendados = 28;
        }
      } catch (e) {
        console.warn('[BelaPed] Aviso ao checar orcamento em simular-otimizacao:', e.message);
      }

      // 3. Avalia elegibilidade de cada distribuidora pelo prazo
      const elegibilidadePorDistribuidora = {};
      portais.forEach(p => {
        const avaliacao = avaliarElegibilidadePortalPorPrazo(p, alvoVencimento, diasMinimosRecomendados);
        elegibilidadePorDistribuidora[p.nome.toUpperCase()] = avaliacao;
      });

      // 4. Analisa cotações REAIS de cada item, filtrando distribuidoras elegíveis
      const itensFiltradosPorPrazo = [];
      const itensComRanking = [];

      itens.forEach(item => {
        if (item.nao_carrinho) return;
        const eanKey = String(item.ean || '').trim();
        const mapaOpcoes = new Map();

        // a) Primeiro carrega do banco belaped_cotacoes_reais
        const doBanco = (eanKey && cotacoesBancoPorEan[eanKey]) || [];
        doBanco.forEach(op => {
          if (op.preco > 0 && op.distribuidora) {
            mapaOpcoes.set(op.distribuidora.toUpperCase(), {
              distribuidora: op.distribuidora.toUpperCase(),
              preco: Number(op.preco)
            });
          }
        });

        // b) Mescla com todas_cotacoes_reais do próprio item (inclui equivalentes/genéricos)
        if (Array.isArray(item.todas_cotacoes_reais)) {
          item.todas_cotacoes_reais.forEach(op => {
            const dName = String(op.distribuidora || op.fornecedor || '').toUpperCase();
            const pr = Number(op.preco);
            if (dName && pr > 0 && (!mapaOpcoes.has(dName) || pr < mapaOpcoes.get(dName).preco)) {
              mapaOpcoes.set(dName, { distribuidora: dName, preco: pr });
            }
          });
        }

        // c) Garante fornecedor_1 e fornecedor_2 do item se forem distribuidoras reais cotadas
        if (item.fornecedor_1 && item.fornecedor_1 !== 'Não Cotado' && !String(item.fornecedor_1).includes('Sem Estoque') && Number(item.preco_1) > 0) {
          const d1 = String(item.fornecedor_1).toUpperCase();
          const p1 = Number(item.preco_1);
          if (!mapaOpcoes.has(d1) || p1 < mapaOpcoes.get(d1).preco) {
            mapaOpcoes.set(d1, { distribuidora: d1, preco: p1 });
          }
        }
        if (item.fornecedor_2 && item.fornecedor_2 !== '—' && item.fornecedor_2 !== 'Não Cotado' && Number(item.preco_2) > 0) {
          const d2 = String(item.fornecedor_2).toUpperCase();
          const p2 = Number(item.preco_2);
          if (!mapaOpcoes.has(d2) || p2 < mapaOpcoes.get(d2).preco) {
            mapaOpcoes.set(d2, { distribuidora: d2, preco: p2 });
          }
        }

        // d) Fallback se cotacoesPorDistribuidora foi enviado explicitamente
        const enviadas = (cotacoesPorDistribuidora && cotacoesPorDistribuidora[eanKey || item.produto_id]) || [];
        if (mapaOpcoes.size === 0 && Array.isArray(enviadas)) {
          enviadas.forEach(op => {
            const dName = String(op.distribuidora || '').toUpperCase();
            const pr = Number(op.preco);
            if (dName && pr > 0) {
              mapaOpcoes.set(dName, { distribuidora: dName, preco: pr });
            }
          });
        }

        // Todas as opções reais ordenadas por preço
        const todosOrdenados = Array.from(mapaOpcoes.values()).filter(p => p.preco > 0).sort((a, b) => a.preco - b.preco);
        if (todosOrdenados.length === 0) {
          const precoRef = Number(item.preco_1 || item.preco_ult_compra || item.custo_unitario || 0);
          if (precoRef <= 0) return;
          const distRef = (item.fornecedor_1 && item.fornecedor_1 !== 'Não Cotado' && !String(item.fornecedor_1).includes('Sem Estoque'))
            ? String(item.fornecedor_1).toUpperCase()
            : (item.fornecedor_ult_compra && item.fornecedor_ult_compra !== 'Não registrado' ? String(item.fornecedor_ult_compra).toUpperCase() : 'OUTROS');
          todosOrdenados.push({ distribuidora: distRef, preco: precoRef });
        }

        const melhorAbsoluto = todosOrdenados[0] || null;

        // Cotações elegíveis pelo prazo
        const elegiveisOrdenadas = todosOrdenados.filter(p => {
          const distNome = String(p.distribuidora || '').toUpperCase();
          const el = elegibilidadePorDistribuidora[distNome];
          return el ? el.elegivel : true;
        });

        const listaValida = elegiveisOrdenadas.length > 0 ? elegiveisOrdenadas : todosOrdenados;
        const melhorElegivel = listaValida[0];
        const segundoElegivel = listaValida[1] || todosOrdenados.find(t => t.distribuidora !== melhorElegivel.distribuidora) || null;

        // Anota se a melhor opção mais barata absoluta foi filtrada por prazo
        if (melhorAbsoluto && melhorElegivel && melhorAbsoluto.distribuidora !== melhorElegivel.distribuidora) {
          itensFiltradosPorPrazo.push({
            produto_id: item.produto_id,
            descricao: item.descricao,
            ean: item.ean,
            melhorMaisBarato: melhorAbsoluto.distribuidora,
            precoMaisBarato: melhorAbsoluto.preco,
            eleitoPorPrazo: melhorElegivel.distribuidora,
            precoEleito: melhorElegivel.preco,
            diferenca: Number((melhorElegivel.preco - melhorAbsoluto.preco).toFixed(2))
          });
        }

        itensComRanking.push({
          ...item,
          melhorPreco: melhorElegivel.preco,
          melhorDistribuidora: melhorElegivel.distribuidora,
          ean_substituto: melhorElegivel.ean_substituto || null,
          laboratorio: melhorElegivel.laboratorio || null,
          is_substituto: Boolean(melhorElegivel.is_substituto),
          todos_concorrentes: melhorElegivel.todos_concorrentes || [],
          segundoPreco: segundoElegivel ? segundoElegivel.preco : null,
          segundaDistribuidora: segundoElegivel ? segundoElegivel.distribuidora : null,
          candidatasElegiveis: listaValida,
          todasOpcoes: todosOrdenados
        });
      });

      // Função auxiliar para garantir que a estrutura de carrinho de uma distribuidora exista
      const obterOuCriarCarrinho = (carrinhosMap, distNomeUpper) => {
        if (!carrinhosMap[distNomeUpper]) {
          const configPortal = portaisMap[distNomeUpper] || {
            pedido_minimo: 300.0,
            prazo_dias_padrao: 28,
            is_mg: 1,
            uf_origem: 'MG'
          };
          const elegInfo = elegibilidadePorDistribuidora[distNomeUpper] || {
            prazoEleito: `${configPortal.prazo_dias_padrao} DDL`,
            diasEleitos: configPortal.prazo_dias_padrao
          };

          carrinhosMap[distNomeUpper] = {
            distribuidora: distNomeUpper,
            pedidoMinimo: Number(configPortal.pedido_minimo) || 300,
            prazoDias: elegInfo.diasEleitos || configPortal.prazo_dias_padrao,
            prazoEleitoBoleto: elegInfo.prazoEleito || `${configPortal.prazo_dias_padrao} DDL`,
            boletoEleito: elegInfo.prazoEleito || `${configPortal.prazo_dias_padrao} DDL`,
            isMg: Boolean(configPortal.is_mg),
            uf: configPortal.uf_origem,
            itens: [],
            total: 0,
            atingiuMinimo: false,
            faltaParaMinimo: 0,
            alertaTributario: !configPortal.is_mg ? '⚠️ Fora de MG (Incidência de ICMS-ST / DIFAL)' : null
          };
        }
        return carrinhosMap[distNomeUpper];
      };

      // 5. Agrupa itens inicialmente por distribuidora vencedora
      let carrinhosPorDistribuidora = {};
      itensComRanking.forEach(item => {
        const dist = (item.melhorDistribuidora || 'OUTROS').toUpperCase();
        const carrinho = obterOuCriarCarrinho(carrinhosPorDistribuidora, dist);

        const qtd = Number(item.qtd_sugerida_7d || item.quantidade) || 1;
        const subtotal = Number((qtd * item.melhorPreco).toFixed(2));

        carrinho.itens.push({
          ...item,
          quantidade: qtd,
          precoUnitario: item.melhorPreco,
          subtotal,
          segundoPreco: item.segundoPreco,
          segundaDistribuidora: item.segundaDistribuidora,
          repassado: false
        });
        carrinho.total = Number((carrinho.total + subtotal).toFixed(2));
      });

      // 6. ALGORITMO DE REPASSE EM CASCATA PARA DISTRIBUIDORAS QUE NÃO ATINGIRAM O MÍNIMO
      // Dissolve uma por uma as distribuidoras abaixo do mínimo (da menor/mais distante do mínimo para a maior),
      // dividindo seus itens entre as demais distribuidoras onde o produto tem cotação!
      const itensRepassados = [];
      const distribuidorasDissolvidas = new Set();
      let houveRepasse = true;
      let iteracoes = 0;

      while (houveRepasse && iteracoes < 10) {
        houveRepasse = false;
        iteracoes++;

        // Identifica distribuidoras que não atingiram o pedido mínimo e ainda não foram dissolvidas
        const nomesInsuficientes = Object.keys(carrinhosPorDistribuidora).filter(nome => {
          if (distribuidorasDissolvidas.has(nome)) return false;
          const c = carrinhosPorDistribuidora[nome];
          return c.itens.length > 0 && c.total > 0 && c.total < c.pedidoMinimo;
        });

        if (nomesInsuficientes.length === 0) break;

        // Ordena pela que está mais longe de atingir o mínimo (ou menor valor total)
        nomesInsuficientes.sort((a, b) => {
          const cA = carrinhosPorDistribuidora[a];
          const cB = carrinhosPorDistribuidora[b];
          const pctA = cA.pedidoMinimo > 0 ? (cA.total / cA.pedidoMinimo) : 1;
          const pctB = cB.pedidoMinimo > 0 ? (cB.total / cB.pedidoMinimo) : 1;
          return pctA - pctB;
        });

        // Pega a distribuidora mais distante do mínimo para dissolver seus itens nas outras
        const distNome = nomesInsuficientes[0];
        const carrinhoOrigem = carrinhosPorDistribuidora[distNome];
        const totalOrigemAntes = carrinhoOrigem.total;
        distribuidorasDissolvidas.add(distNome);

        const itensParaAvaliar = [...carrinhoOrigem.itens];

        for (const item of itensParaAvaliar) {
          // Lista todas as outras distribuidoras que têm preço cotado para este item e não foram dissolvidas
          const opcoesDispo = (item.todasOpcoes || []).filter(
            c => c.distribuidora.toUpperCase() !== distNome && !distribuidorasDissolvidas.has(c.distribuidora.toUpperCase())
          );

          if (opcoesDispo.length === 0) continue;

          // Prioriza: 1º empresas que já têm carrinho aberto (ordenadas pelo menor preço do item), 2º qualquer outra cotada
          const comCarrinhoAberto = opcoesDispo.filter(c => {
            const dest = carrinhosPorDistribuidora[c.distribuidora.toUpperCase()];
            return dest && dest.itens.length > 0;
          });

          const candEscolhida = comCarrinhoAberto.length > 0 ? comCarrinhoAberto[0] : opcoesDispo[0];
          const destNome = candEscolhida.distribuidora.toUpperCase();
          const carrinhoDestino = obterOuCriarCarrinho(carrinhosPorDistribuidora, destNome);

          const subtotalAntigo = item.subtotal;
          const novoSubtotal = Number((item.quantidade * candEscolhida.preco).toFixed(2));

          // Remove do carrinho de origem
          carrinhoOrigem.itens = carrinhoOrigem.itens.filter(i => i.produto_id !== item.produto_id);
          carrinhoOrigem.total = Number(carrinhoOrigem.itens.reduce((acc, i) => acc + i.subtotal, 0).toFixed(2));

          // Descobre qual passa a ser a nova 2ª colocada para este item (caso o usuário queira repassar manualmente depois)
          const outraOpcao = opcoesDispo.find(c => c.distribuidora.toUpperCase() !== destNome) || null;

          const itemRepassado = {
            ...item,
            melhorDistribuidora: destNome,
            melhorPreco: candEscolhida.preco,
            precoUnitario: candEscolhida.preco,
            subtotal: novoSubtotal,
            ean_substituto: candEscolhida.ean_substituto || null,
            laboratorio: candEscolhida.laboratorio || null,
            is_substituto: Boolean(candEscolhida.is_substituto),
            todos_concorrentes: candEscolhida.todos_concorrentes || [],
            segundaDistribuidora: outraOpcao ? outraOpcao.distribuidora : distNome,
            segundoPreco: outraOpcao ? outraOpcao.preco : item.precoUnitario,
            repassado: true,
            repassadoDe: distNome,
            repassadoPara: destNome,
            precoOriginal: item.precoUnitario,
            diferencaPreco: Number((novoSubtotal - subtotalAntigo).toFixed(2)),
            motivoRepasse: `Repassado de ${distNome} (tinha R$ ${totalOrigemAntes.toFixed(2)} de R$ ${carrinhoOrigem.pedidoMinimo.toFixed(2)} mín.)`
          };

          carrinhoDestino.itens.push(itemRepassado);
          carrinhoDestino.total = Number(carrinhoDestino.itens.reduce((acc, i) => acc + i.subtotal, 0).toFixed(2));

          itensRepassados.push({
            produto_id: item.produto_id,
            descricao: item.descricao,
            ean: item.ean,
            quantidade: item.quantidade,
            de: distNome,
            para: destNome,
            precoDe: item.precoUnitario,
            precoPara: candEscolhida.preco,
            diferenca: Number((candEscolhida.preco - item.precoUnitario).toFixed(2)),
            diferencaSubtotal: Number((novoSubtotal - subtotalAntigo).toFixed(2))
          });

          houveRepasse = true;
        }
      }

      // 7. Consolidação final dos carrinhos
      const carrinhosFinais = [];
      const sugestoesReagrupamento = [];
      const distribuicaoPorVencimento = {};
      let totalGeral = 0;
      let economiaTotalVsReferencia = 0;

      Object.values(carrinhosPorDistribuidora).forEach(carrinho => {
        if (carrinho.itens.length === 0 || carrinho.total <= 0) {
          return;
        }

        carrinho.total = Number(carrinho.total.toFixed(2));
        totalGeral += carrinho.total;

        // Regra Especial da DISTRIMED: Escolher o vencimento (até 60d, parcelas <= R$ 250 nos dias de menor despesa)
        if (carrinho.distribuidora.toUpperCase().includes('DISTRIMED')) {
          const planoDistrimed = calcularParcelasDistrimedMenorDespesa(carrinho.total);
          carrinho.distrimedPlanoInteligente = planoDistrimed;
          carrinho.boletoEleito = planoDistrimed.opcaoLabel;
          carrinho.prazoEleitoBoleto = planoDistrimed.opcaoLabel;
          carrinho.parcelasCalculadas = planoDistrimed.parcelas;
          if (planoDistrimed.parcelas.length > 0) {
            const primeiraParc = planoDistrimed.parcelas[0];
            carrinho.dataVencimentoEstimada = primeiraParc.dueDate;
            carrinho.mesVencimentoFormatado = `${primeiraParc.nomeMes}/${primeiraParc.dueDate.slice(0, 4)}`;
          }
        } else {
          const diasPrazo = carrinho.prazoDias || 28;
          const dataVenc = new Date(Date.now() + diasPrazo * 86400000);
          carrinho.dataVencimentoEstimada = dataVenc.toISOString().split('T')[0];
          const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
          carrinho.mesVencimentoFormatado = `${nomesMeses[dataVenc.getMonth()]}/${dataVenc.getFullYear()}`;
        }

        const mesAnoVenc = carrinho.mesVencimentoFormatado || 'Próximo Mês';
        if (!distribuicaoPorVencimento[mesAnoVenc]) {
          distribuicaoPorVencimento[mesAnoVenc] = 0;
        }
        distribuicaoPorVencimento[mesAnoVenc] = Number((distribuicaoPorVencimento[mesAnoVenc] + carrinho.total).toFixed(2));

        // Avalia se atingiu o mínimo
        if (carrinho.total >= carrinho.pedidoMinimo) {
          carrinho.atingiuMinimo = true;
          carrinho.faltaParaMinimo = 0;
          carrinho.sugestoesComplementoCurvaA = [];
        } else {
          carrinho.atingiuMinimo = false;
          carrinho.faltaParaMinimo = Number((carrinho.pedidoMinimo - carrinho.total).toFixed(2));

          // Sugestões de Curva A com saldo zerado no ERP para completar o pedido mínimo
          let sugsCurvaA = [];
          try {
            const queryCurvaA = `
              SELECT 
                c.produto_id,
                c.descricao,
                c.apresentacao,
                c.ean,
                c.curva_abc,
                c.saldo,
                c.vmd_ponderado,
                c.est_minimo_calculado,
                c.custo_unitario,
                cr.preco as preco_portal,
                cr.fornecedor,
                cr.url_produto
              FROM compras_estoque_cache c
              INNER JOIN belaped_cotacoes_reais cr ON cr.ean = c.ean AND cr.disponivel = 1 AND cr.preco > 0
              WHERE c.curva_abc = 'A'
                AND c.saldo <= 0
                AND (UPPER(cr.fornecedor) = UPPER(?) OR UPPER(cr.fornecedor) LIKE ?)
              ORDER BY c.vmd_ponderado DESC
              LIMIT 20
            `;
            const candidatosCurvaA = db.prepare(queryCurvaA).all(carrinho.distribuidora, `%${carrinho.distribuidora.toUpperCase()}%`);
            let acumuladoCurvaA = 0;
            for (const item of candidatosCurvaA) {
              const preco = Number(item.preco_portal);
              if (preco <= 0) continue;
              const vmd = Number(item.vmd_ponderado || 0);
              const qtdSugerida = Math.max(1, Math.min(20, Math.ceil(vmd * 7)));
              const subtotal = Number((qtdSugerida * preco).toFixed(2));
              sugsCurvaA.push({
                ...item,
                qtd_sugerida: qtdSugerida,
                subtotal
              });
              acumuladoCurvaA += subtotal;
              if (acumuladoCurvaA >= carrinho.faltaParaMinimo) {
                break;
              }
            }
          } catch (e) {
            console.warn('[BelaPed] Aviso ao buscar sugestoesComplementoCurvaA em simular-otimizacao:', e.message);
            sugsCurvaA = [];
          }

          carrinho.sugestoesComplementoCurvaA = sugsCurvaA;

          sugestoesReagrupamento.push({
            distribuidora: carrinho.distribuidora,
            valorAtual: carrinho.total,
            pedidoMinimo: carrinho.pedidoMinimo,
            falta: carrinho.faltaParaMinimo,
            sugestao: `Faltam R$ ${carrinho.faltaParaMinimo.toFixed(2)} para atingir o mínimo (itens exclusivos desta distribuidora).`,
            sugestoesComplementoCurvaA: sugsCurvaA
          });
        }

        // Economia vs custo de referência do produto
        carrinho.itens.forEach(i => {
          const custoRef = Number(i.preco_ult_compra || i.custo_unitario) || i.precoUnitario;
          if (custoRef > i.precoUnitario) {
            economiaTotalVsReferencia += (custoRef - i.precoUnitario) * i.quantidade;
          }
        });

        carrinhosFinais.push(carrinho);
      });

      // Ordena carrinhos: primeiro os que atingiram o mínimo e por maior valor
      carrinhosFinais.sort((a, b) => {
        if (a.atingiuMinimo !== b.atingiuMinimo) return a.atingiuMinimo ? -1 : 1;
        return b.total - a.total;
      });

      res.json({
        success: true,
        alvoVencimentoAtivo: alvoVencimento,
        statusOrcamentoMesAtual,
        diasMinimosRecomendados,
        resumo: {
          totalGeral: Number(totalGeral.toFixed(2)),
          economiaTotal: Number(economiaTotalVsReferencia.toFixed(2)),
          totalDistribuidores: carrinhosFinais.length,
          distribuidoresQueAtingiramMinimo: carrinhosFinais.filter(c => c.atingiuMinimo).length,
          distribuidoresAbaixoDoMinimo: carrinhosFinais.filter(c => !c.atingiuMinimo).length,
          totalItensRepassados: itensRepassados.length,
          totalItensFiltradosPorPrazo: itensFiltradosPorPrazo.length,
          distribuicaoPorVencimento
        },
        carrinhos: carrinhosFinais,
        itensRepassados,
        itensFiltradosPorPrazo,
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

    // EANs marcados pelo usuário para NÃO COTAR ou ADIADOS PARA A PRÓXIMA SEMANA
    const eansNaoCotar = new Set(
      db.prepare(`
        SELECT ean FROM belaped_produtos_regras 
        WHERE (nao_cotar = 1 OR (adiar_ate IS NOT NULL AND date(adiar_ate) > date('now', 'localtime')))
          AND ean IS NOT NULL
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
    const setDesejadosP1 = new Set();
    try {
      const avulsosDesejados = db.prepare('SELECT ean, descricao, preco_referencia FROM belaped_itens_avulsos WHERE ean IS NOT NULL AND length(TRIM(ean)) >= 7').all();
      for (const av of avulsosDesejados) {
        const eanAv = String(av.ean).trim();
        if (!eanAv || eansNaoCotar.has(eanAv)) continue;
        if (!mapaDescricoes[eanAv] && av.descricao) mapaDescricoes[eanAv] = av.descricao;
        if (!mapaUltimoCusto[eanAv] && Number(av.preco_referencia) > 0) mapaUltimoCusto[eanAv] = Number(av.preco_referencia);
        mapaPrioridadeEan[eanAv] = 'P1';
        if (!eansComPrecoHoje.has(eanAv) && !setDesejadosP1.has(eanAv)) {
          p1List.push(eanAv);
          setDesejadosP1.add(eanAv);
        }
      }
    } catch (eAv) {}

    for (const p of todosCache) {
      const ean = String(p.ean).trim();
      const saldo = Number(p.saldo) || 0;
      const vmd = Number(p.vmd_ponderado) || 0;
      const curva = p.curva_abc || 'C';
      const isCurvaAlta = curva === 'A' || curva === 'B';
      const diasCob = vmd > 0 ? (saldo / vmd) : 999;
      const vendas30 = Number(p.vendas_30d) || 0;
      const estMin = Number(p.est_minimo_calculado) || 0;

      let prio = setDesejadosP1.has(ean) ? 'P1' : 'P4';
      if (!setDesejadosP1.has(ean)) {
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
      }
      mapaPrioridadeEan[ean] = prio;

      // Só entra na fila pendente se estiver em falta/ruptura E NÃO tiver sido cotado nas últimas 24h E NÃO estiver marcado para não cotar
      if (!setDesejadosP1.has(ean) && (saldo <= 0 || saldo < estMin) && !eansComPrecoHoje.has(ean) && !eansNaoCotar.has(ean)) {
        if (prio === 'P1') p1List.push(ean);
        else if (prio === 'P2') p2List.push(ean);
        else if (prio === 'P3') p3List.push(ean);
        else p4List.push(ean);
      }
    }

    if (Array.isArray(eans) && eans.length > 0) {
      const filtrados = eans.map(e => String(e || '').trim()).filter(e => e.length >= 7 && !eansNaoCotar.has(e));
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

    const numWorkers = fornecedor === 'TODOS' ? 7 : 1;
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
        INSERT INTO belaped_cotacoes_reais (ean, fornecedor, preco, disponivel, descricao, desc_pct, url_produto, condicao_comercial, preco_padrao, is_generico_mais_barato, ean_substituto, laboratorio, is_substituto, todos_concorrentes, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(ean, fornecedor) DO UPDATE SET
          preco = excluded.preco,
          disponivel = excluded.disponivel,
          descricao = excluded.descricao,
          desc_pct = excluded.desc_pct,
          url_produto = CASE WHEN excluded.url_produto IS NOT NULL AND excluded.url_produto != '' THEN excluded.url_produto ELSE belaped_cotacoes_reais.url_produto END,
          condicao_comercial = excluded.condicao_comercial,
          preco_padrao = excluded.preco_padrao,
          is_generico_mais_barato = excluded.is_generico_mais_barato,
          ean_substituto = excluded.ean_substituto,
          laboratorio = excluded.laboratorio,
          is_substituto = excluded.is_substituto,
          todos_concorrentes = excluded.todos_concorrentes,
          updated_at = excluded.updated_at
      `);

      // Inicializa status detalhado por portal para o Mini-Monitor no canto inferior direito
      cotacaoStatus.workers = {
        'PROFARMA': { status: 'AGUARDANDO', itemAtual: 'Aguardando fila...', avaliados: 0, encontrados: 0, semEstoque: 0 },
        'DPC DISTRIBUIDORA': { status: 'AGUARDANDO', itemAtual: 'Aguardando fila...', avaliados: 0, encontrados: 0, semEstoque: 0 },
        'SOTON FARMA': { status: 'AGUARDANDO', itemAtual: 'Aguardando fila...', avaliados: 0, encontrados: 0, semEstoque: 0 },
        'DISTRIMED': { status: 'AGUARDANDO', itemAtual: 'Aguardando fila...', avaliados: 0, encontrados: 0, semEstoque: 0 },
        'DIVIMED': { status: 'AGUARDANDO', itemAtual: 'Aguardando fila...', avaliados: 0, encontrados: 0, semEstoque: 0 },
        'MARTINS ATACADO': { status: 'AGUARDANDO', itemAtual: 'Aguardando fila...', avaliados: 0, encontrados: 0, semEstoque: 0 },
        'ORIENTE FARMA': { status: 'AGUARDANDO', itemAtual: 'Aguardando fila...', avaliados: 0, encontrados: 0, semEstoque: 0 }
      };

      const executarRoboParaFornecedor = async (nomeFornecedor, RobotClass, delayInicialMs = 0) => {
        let robot = null;
        if (!cotacaoStatus.workers[nomeFornecedor]) {
          cotacaoStatus.workers[nomeFornecedor] = { status: 'INICIANDO', itemAtual: 'Iniciando navegador...', avaliados: 0, encontrados: 0, semEstoque: 0 };
        }
        try {
          if (delayInicialMs > 0) {
            cotacaoStatus.workers[nomeFornecedor].status = 'AGUARDANDO';
            cotacaoStatus.workers[nomeFornecedor].itemAtual = `Escalonando abertura (${(delayInicialMs / 1000).toFixed(1)}s)...`;
            await new Promise(r => setTimeout(r, delayInicialMs));
          }

          if (cotacaoStatus.solicitouParar) {
            cotacaoStatus.workers[nomeFornecedor].status = 'INTERROMPIDO';
            cotacaoStatus.workers[nomeFornecedor].itemAtual = 'Interrompido antes de iniciar';
            return;
          }

          console.log(`[BelaPed Cotação] Iniciando robô para ${nomeFornecedor}...`);
          cotacaoStatus.workers[nomeFornecedor].status = 'AUTENTICANDO';
          cotacaoStatus.workers[nomeFornecedor].itemAtual = 'Autenticando no portal B2B...';
          cotacaoStatus.ultimoItem = `${nomeFornecedor}: Autenticando no portal...`;

          // Retry automático na inicialização do navegador/login para evitar falha por pico de CPU (Runtime.callFunctionOn timed out)
          let iniciouOk = false;
          let ultimoErroInit = null;
          for (let tentativaInit = 1; tentativaInit <= 2; tentativaInit++) {
            try {
              robot = new RobotClass({ headless: true });
              await robot.iniciar();
              iniciouOk = true;
              break;
            } catch (initErr) {
              ultimoErroInit = initErr;
              console.warn(`[BelaPed Cotação] ⚠️ Tentativa ${tentativaInit}/2 de iniciar ${nomeFornecedor} falhou: ${initErr.message}`);
              if (robot) await robot.fechar().catch(() => {});
              robot = null;
              if (tentativaInit < 2 && !cotacaoStatus.solicitouParar) {
                cotacaoStatus.workers[nomeFornecedor].itemAtual = `Reconectando ao portal (2ª tentativa)...`;
                await new Promise(r => setTimeout(r, 2500));
              }
            }
          }
          if (!iniciouOk) {
            throw ultimoErroInit || new Error(`Falha ao autenticar em ${nomeFornecedor}`);
          }

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

            let resultado;
            try {
              resultado = await Promise.race([
                robot.cotarEAN(eanAtual, descAtual),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout de 10s excedido ao cotar produto')), 10000))
              ]);
            } catch (itemErr) {
              console.warn(`[BelaPed Cotação] ⚠️ Erro ao cotar item ${eanAtual} em ${nomeFornecedor}: ${itemErr.message}`);
              resultado = { disponivel: false, preco: null, mensagem: `Falha temporária: ${itemErr.message}` };
              // Se a sessão/página do Puppeteer travou (callFunctionOn timed out / Target closed), tenta reiniciar o robô para não perder o resto do lote
              if (/timed out|Target closed|Session closed|Protocol error| detached/i.test(itemErr.message || '') && !cotacaoStatus.solicitouParar) {
                try {
                  cotacaoStatus.workers[nomeFornecedor].itemAtual = `♻️ Recuperando navegador de ${nomeFornecedor}...`;
                  if (robot) await robot.fechar().catch(() => {});
                  await new Promise(r => setTimeout(r, 1500));
                  robot = new RobotClass({ headless: true });
                  await robot.iniciar();
                } catch (recErr) {
                  console.warn(`[BelaPed Cotação] Falha ao recuperar navegador de ${nomeFornecedor}: ${recErr.message}`);
                }
              }
            }

            // Double-Check Automático: se houver diferença muito grande entre o último custo de compra e o preço cotado
            const ultCustoRef = mapaUltimoCusto[eanAtual] || 0;
            if (resultado && resultado.disponivel && resultado.preco > 0 && ultCustoRef > 0) {
              const diffPct = ((resultado.preco - ultCustoRef) / ultCustoRef) * 100;
              // Queda >= 40% (suspeita de fracionamento ou erro de leitura) ou aumento >= 60%
              if (diffPct <= -40 || diffPct >= 60) {
                console.warn(`[BelaPed Double-Check] ⚠️ Divergência alta de ${diffPct.toFixed(1)}% detectada em ${nomeFornecedor} para "${descAtual || eanAtual}" (Últ. Compra R$ ${ultCustoRef.toFixed(2)} vs Cotado R$ ${resultado.preco.toFixed(2)}). Rodando robô novamente no produto para confirmação...`);
                cotacaoStatus.workers[nomeFornecedor].itemAtual = `🔄 Double-check (${diffPct > 0 ? '+' : ''}${diffPct.toFixed(0)}% vs últ. compra): ${descAtual || eanAtual}`;
                cotacaoStatus.ultimoItem = `🔄 Double-check ${nomeFornecedor}: ${descAtual || eanAtual}`;

                await new Promise(r => setTimeout(r, 1800));
                try {
                  const segTentativa = await robot.cotarEAN(eanAtual, descAtual);
                  if (segTentativa && segTentativa.disponivel && segTentativa.preco > 0) {
                    console.log(`[BelaPed Double-Check] ✅ Produto re-cotado com sucesso: R$ ${segTentativa.preco.toFixed(2)} (1ª: R$ ${resultado.preco.toFixed(2)})`);
                    resultado = segTentativa;
                  } else {
                    console.warn(`[BelaPed Double-Check] ❌ Produto não confirmado na 2ª tentativa do robô. Descartando valor suspeito.`);
                    resultado = { disponivel: false, preco: null, mensagem: 'Divergência não confirmada no reteste do robô' };
                  }
                } catch (dcErr) {
                  resultado = { disponivel: false, preco: null, mensagem: 'Erro na 2ª confirmação do robô' };
                }
              }
            }

            // 🛡️ TRAVAS DE SEGURANÇA MÁSTER DO BELAPED:
            if (resultado && resultado.disponivel && resultado.preco > 0) {
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
              // Trava 3: 🛡️ Validação Estrita Semântica Anti-Alucinação (impede troca de produto/marca/público)
              // Bypassa validação se for substituto equivalente ou genérico reconhecido pelo motor de essência
              else if (descAtual && resultado.descricao && !resultado.isSubstituto && !resultado.isGenericoEquivalente && !resultado.is_substituto && !resultado.is_generico_mais_barato) {
                const checagemSem = validarCorrespondenciaProduto(descAtual, resultado.descricao);
                if (!checagemSem.valido) {
                  console.warn(`[BelaPed Segurança] ⛔ Cotação bloqueada por discrepância semântica em ${nomeFornecedor}: esperado "${descAtual}" vs retornado "${resultado.descricao}" (${checagemSem.motivo})`);
                  resultado = { disponivel: false, preco: null, mensagem: `Descartado: ${checagemSem.motivo}` };
                }
              }
            }

            passosConcluidos++;
            cotacaoStatus.workers[nomeFornecedor].avaliados++;
            cotacaoStatus.atual = Math.min(listaEans.length, Math.max(1, Math.ceil(passosConcluidos / numWorkers)));

            const horaLog = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            if (resultado && resultado.disponivel && resultado.preco > 0) {
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
                resultado.url || resultado.urlProduto || resultado.link || gerarUrlDistribuidoraProduto(nomeFornecedor, eanAtual, descAtual),
                resultado.condicao_comercial || null,
                resultado.preco_padrao || resultado.preco,
                resultado.isGenericoEquivalente ? 1 : 0,
                resultado.isSubstituto ? (resultado.eanSubstituto || resultado.ean || null) : null,
                resultado.laboratorio || null,
                resultado.isSubstituto ? 1 : 0,
                resultado.todosConcorrentes ? JSON.stringify(resultado.todosConcorrentes) : null
              );

              if (resultado.isSubstituto) {
                motorEssencia.registrarEquivalenciaNoBanco(db, eanAtual, resultado, descAtual, nomeFornecedor);
              }

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
                (resultado && resultado.mensagem) || 'Indisponível',
                0,
                null,
                null,
                null,
                0,
                null,
                null,
                0,
                null
              );
              cotacaoStatus.log.push({
                hora: horaLog,
                fornecedor: nomeFornecedor,
                ean: eanAtual,
                descricao: descAtual || eanAtual,
                status: 'INDISPONIVEL',
                motivo: (resultado && resultado.mensagem) || 'Sem estoque'
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
        } else if (fornecedor === 'ORIENTE') {
          await executarRoboParaFornecedor('ORIENTE FARMA', OrienteRobot);
        } else if (fornecedor === 'PANPHARMA' || fornecedor === 'PANFARMA') {
          await executarRoboParaFornecedor('PANPHARMA', PanpharmaRobot);
        } else if (fornecedor === 'TODOS') {
          await Promise.all([
            executarRoboParaFornecedor('PROFARMA', ProfarmaRobot, 0),
            executarRoboParaFornecedor('DPC DISTRIBUIDORA', DpcRobot, 1200),
            executarRoboParaFornecedor('SOTON FARMA', SotonRobot, 2400),
            executarRoboParaFornecedor('DISTRIMED', DistrimedRobot, 3600),
            executarRoboParaFornecedor('DIVIMED', DivimedRobot, 4800),
            executarRoboParaFornecedor('MARTINS ATACADO', MartinsRobot, 6000),
            executarRoboParaFornecedor('ORIENTE FARMA', OrienteRobot, 7200),
            executarRoboParaFornecedor('PANPHARMA', PanpharmaRobot, 8400)
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
        try {
          expurgarCotacoesInconsistentes(db);
        } catch (expErr) {
          console.warn('[BelaPed Cotação] Erro no expurgo pós-lote:', expErr.message);
        }
      }
    })();

    return true;
  };

  /**
   * Varre a tabela belaped_cotacoes_reais e remove cotações inconsistentes com o catálogo do ERP.
   * Cotações legítimas de substitutos (is_substituto = 1 ou is_generico_mais_barato = 1)
   * são expressamente PRESERVADAS e não sofrem expurgo por divergência de laboratório/marca.
   */
  function expurgarCotacoesInconsistentes(dbInstance) {
    const activeDb = dbInstance || db;
    try {
      const cotacoes = activeDb.prepare(`
        SELECT c.id, c.ean, c.fornecedor, c.preco, c.descricao as desc_cotada, e.descricao as desc_esperada,
               COALESCE(c.is_substituto, 0) as is_substituto,
               COALESCE(c.is_generico_mais_barato, 0) as is_generico_mais_barato
        FROM belaped_cotacoes_reais c
        JOIN compras_estoque_cache e ON e.ean = c.ean
        WHERE c.disponivel = 1 AND c.preco > 0
          AND COALESCE(c.is_substituto, 0) = 0
          AND COALESCE(c.is_generico_mais_barato, 0) = 0
      `).all();

      let removidas = 0;
      const stmtInvalidar = activeDb.prepare(`
        UPDATE belaped_cotacoes_reais
        SET disponivel = 0, preco = NULL, descricao = @motivo, updated_at = datetime('now')
        WHERE id = @id
      `);

      for (const row of cotacoes) {
        const checagem = validarCorrespondenciaProduto(row.desc_esperada, row.desc_cotada);
        if (!checagem.valido) {
          console.warn(`[Expurgo Cotação] 🧹 Invalidando cotação ID ${row.id} (${row.fornecedor}): EAN ${row.ean} - Esperado "${row.desc_esperada}" vs Cotado "${row.desc_cotada}" (${checagem.motivo})`);
          stmtInvalidar.run({
            id: row.id,
            motivo: `[Incompatível] ${checagem.motivo}`
          });
          removidas++;
        }
      }

      if (removidas > 0) {
        console.log(`[Expurgo Cotação] ✅ ${removidas} cotações inconsistentes/fantasmas foram expurgadas com sucesso.`);
      }
      return removidas;
    } catch (err) {
      console.error('[Expurgo Cotação] Erro ao expurgar cotações inconsistentes:', err.message);
      return 0;
    }
  }

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
        console.log(`[BelaPed Agendador] >>> HORÁRIO ESTRATÉGICO (${horaMinutoAtual}): Disparando cotação nos 7 portais! <<<`);
        verificarERodarCotacaoSegundoPlano(`HORARIO_ESTRATEGICO_${horaMinutoAtual}`);
      }

      // Agendador Quinzenal de Auditoria Segura de Prazos de Boletos e Pedidos Mínimos (Dias 1 e 16 às 06:15)
      const diaDoMes = agora.getDate();
      if ((diaDoMes === 1 || diaDoMes === 16) && horaMinutoAtual === '06:15' && ultimoMinutoAgendado !== 'AUDITORIA_06:15') {
        ultimoMinutoAgendado = 'AUDITORIA_06:15';
        console.log('[BelaPed Agendador] >>> DISPARO QUINZENAL: Iniciando Auditoria Segura de Prazos e Pedidos Mínimos <<<');
        auditarTodasDistribuidoras(db).catch(e => console.error('[BelaPed Agendador] Erro na auditoria quinzenal:', e.message));
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
   * POST /api/belaped/reiniciar-cotacao
   * Destrava e reinicia a cotação imediatamente, interrompendo qualquer ciclo pendente
   */
  router.post('/reiniciar-cotacao', async (req, res) => {
    try {
      const { fornecedor = 'TODOS', limite = 40, eans, prioridade, dispararImediato = false } = req.body || {};

      console.log('[BelaPed Cotação] 🔄 Reinicialização solicitada pelo usuário...');

      // 1. Sinaliza parada para qualquer robô que esteja em loop
      cotacaoStatus.solicitouParar = true;

      // 2. Aguarda um breve momento para os robôs lerem o flag de parada caso estejam ativos
      if (cotacaoStatus.emAndamento) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // 3. Força reset completo do status
      cotacaoStatus.emAndamento = false;
      cotacaoStatus.solicitouParar = false;
      cotacaoStatus.atual = 0;
      cotacaoStatus.encontrados = 0;
      cotacaoStatus.total = 0;
      cotacaoStatus.iniciadoEm = null;
      cotacaoStatus.finalizadoEm = null;
      cotacaoStatus.ultimoItem = '🔄 Cotação reiniciada. Pronto para novo ciclo.';
      if (cotacaoStatus.workers) {
        Object.keys(cotacaoStatus.workers).forEach(w => {
          cotacaoStatus.workers[w] = { status: 'AGUARDANDO', itemAtual: 'Pronto para iniciar', avaliados: 0, encontrados: 0, semEstoque: 0 };
        });
      }

      // 4. Se dispararImediato for true, aciona novo lote
      let iniciado = false;
      if (dispararImediato) {
        iniciado = await executarCotacaoAoVivoInternal(fornecedor, limite, eans, prioridade);
      }

      res.json({
        success: true,
        iniciado,
        message: iniciado 
          ? `Cotação reiniciada com sucesso para ${fornecedor}!` 
          : 'Cotação reiniciada e status zerado com sucesso.',
        status: cotacaoStatus
      });
    } catch (err) {
      cotacaoStatus.emAndamento = false;
      cotacaoStatus.solicitouParar = false;
      console.error('[BelaPed] Erro no endpoint reiniciar-cotacao:', err.message);
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
      const { ean, fornecedor, descricao, por_essencia } = req.body;
      const eanLimpo = String(ean || '').trim();
      if (!eanLimpo) {
        return res.status(400).json({ success: false, error: 'EAN é obrigatório para re-cotação.' });
      }

      let descFinal = descricao;
      if (!descFinal) {
        const rowEst = db.prepare('SELECT descricao FROM compras_estoque_cache WHERE ean = ?').get(eanLimpo);
        if (rowEst && rowEst.descricao) descFinal = rowEst.descricao;
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
        'MARTINS': MartinsRobot,
        'ORIENTE FARMA': OrienteRobot,
        'ORIENTE': OrienteRobot,
        'PANPHARMA': PanpharmaRobot,
        'PANFARMA': PanpharmaRobot
      };

      // Determina quais distribuidoras rodar
      let fornecedorAlvo = fornecedor ? String(fornecedor).trim().toUpperCase() : 'TODOS';
      const portaisParaCotar = (fornecedorAlvo === 'TODOS' || !MAPA_CLASSES[fornecedorAlvo])
        ? ['PROFARMA', 'DPC DISTRIBUIDORA', 'SOTON FARMA', 'DISTRIMED', 'DIVIMED', 'MARTINS ATACADO', 'ORIENTE FARMA', 'PANPHARMA']
        : [fornecedorAlvo];

      console.log(`[BelaPed Re-cotação] Rodando re-cotação sob demanda para o EAN ${eanLimpo} (${descFinal || ''}) em [${portaisParaCotar.join(', ')}]...`);

      const stmtSalvar = db.prepare(`
        INSERT INTO belaped_cotacoes_reais (ean, fornecedor, preco, disponivel, descricao, desc_pct, url_produto, condicao_comercial, preco_padrao, is_generico_mais_barato, ean_substituto, laboratorio, is_substituto, todos_concorrentes, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(ean, fornecedor) DO UPDATE SET
          preco = excluded.preco,
          disponivel = excluded.disponivel,
          descricao = excluded.descricao,
          desc_pct = excluded.desc_pct,
          url_produto = CASE WHEN excluded.url_produto IS NOT NULL AND excluded.url_produto != '' THEN excluded.url_produto ELSE belaped_cotacoes_reais.url_produto END,
          condicao_comercial = excluded.condicao_comercial,
          preco_padrao = excluded.preco_padrao,
          is_generico_mais_barato = excluded.is_generico_mais_barato,
          ean_substituto = excluded.ean_substituto,
          laboratorio = excluded.laboratorio,
          is_substituto = excluded.is_substituto,
          todos_concorrentes = excluded.todos_concorrentes,
          updated_at = excluded.updated_at
      `);

      const campanhasDistrimed = db.prepare('SELECT * FROM belaped_distrimed_campanhas WHERE ativo = 1').all();
      const resultadosFinais = [];

      await Promise.allSettled(portaisParaCotar.map(async (nomePortal) => {
        const RobotCls = MAPA_CLASSES[nomePortal];
        if (!RobotCls) return;
        const rob = new RobotCls({ headless: true });
        try {
          await rob.iniciar();

          let resCot = null;
          const optsEssencia = { cotarPorEssencia: por_essencia !== false };
          // Se for Distrimed e houver campanhas cadastradas, usa cotação multi-condições
          if (nomePortal.includes('DISTRIMED') && typeof rob.cotarLoteDistrimedMultiCondicoes === 'function') {
            const mapa = await rob.cotarLoteDistrimedMultiCondicoes([{ ean: eanLimpo, descricao: descFinal || '', quantidade: 1 }], campanhasDistrimed);
            resCot = mapa.get(eanLimpo) || await rob.cotarEAN(eanLimpo, descFinal || '', optsEssencia);
          } else {
            resCot = await rob.cotarEAN(eanLimpo, descFinal || '', optsEssencia);
          }

          // 🛡️ Validação Estrita Semântica Anti-Alucinação (se não for substituto/genérico intencional)
          if (resCot.disponivel && resCot.preco > 0 && descFinal && resCot.descricao && !resCot.isGenericoEquivalente && !resCot.isSubstituto) {
            const checagemSem = validarCorrespondenciaProduto(descFinal, resCot.descricao);
            if (!checagemSem.valido) {
              console.warn(`[BelaPed Re-cotação] ⛔ Cotação bloqueada por discrepância semântica em ${nomePortal}: esperado "${descFinal}" vs retornado "${resCot.descricao}" (${checagemSem.motivo})`);
              resCot.disponivel = false;
              resCot.preco = null;
              resCot.mensagem = `Descartado: ${checagemSem.motivo}`;
            }
          }

          if (resCot.disponivel && resCot.preco > 0) {
            stmtSalvar.run(
              eanLimpo,
              nomePortal,
              resCot.preco,
              1,
              resCot.descricao || descFinal || '',
              resCot.descPct || 0,
              resCot.url || resCot.urlProduto || resCot.link || gerarUrlDistribuidoraProduto(nomePortal, eanLimpo, descFinal),
              resCot.condicao_comercial || null,
              resCot.preco_padrao || resCot.preco,
              resCot.isGenericoEquivalente ? 1 : 0,
              resCot.isSubstituto ? (resCot.eanSubstituto || resCot.ean || null) : null,
              resCot.laboratorio || null,
              resCot.isSubstituto ? 1 : 0,
              resCot.todosConcorrentes ? JSON.stringify(resCot.todosConcorrentes) : null
            );

            if (resCot.isSubstituto) {
              motorEssencia.registrarEquivalenciaNoBanco(db, eanLimpo, resCot, descFinal, nomePortal);
            }
          } else {
            stmtSalvar.run(
              eanLimpo,
              nomePortal,
              null,
              0,
              resCot.mensagem || 'Indisponível no reteste do robô',
              0,
              null,
              null,
              null,
              0,
              null,
              null,
              0,
              null
            );
          }

          resultadosFinais.push({
            fornecedor: nomePortal,
            disponivel: resCot.disponivel,
            preco: resCot.preco,
            descricao: resCot.descricao || '',
            condicao_comercial: resCot.condicao_comercial || null,
            is_generico_mais_barato: Boolean(resCot.isGenericoEquivalente)
          });
        } catch (eRobo) {
          console.error(`[BelaPed Re-cotação] Erro no robô ${nomePortal}:`, eRobo.message);
        } finally {
          await rob.fechar().catch(() => {});
        }
      }));

      res.json({
        success: true,
        ean: eanLimpo,
        resultados: resultadosFinais
      });
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
   * GET /api/belaped/concorrentes-essencia/:ean
   * Retorna os concorrentes cotados na essência farmacológica deste produto,
   * incluindo histórico de equivalências registradas e dados locais de estoque/custo.
   */
  router.get('/concorrentes-essencia/:ean', (req, res) => {
    try {
      const eanLimpo = String(req.params.ean || '').trim();
      if (!eanLimpo) {
        return res.status(400).json({ success: false, error: 'EAN é obrigatório.' });
      }

      // 1. Dados do produto original no estoque
      const produtoOriginal = db.prepare(`
        SELECT ean, descricao, saldo, custo_unitario, preco_unitario_ult_compra, vmd_ponderado, curva_abc
        FROM compras_estoque_cache
        WHERE ean = ?
      `).get(eanLimpo);

      // 2. Cotações reais nos portais
      const cotacoesReais = db.prepare(`
        SELECT fornecedor, preco, disponivel, descricao, ean_substituto, laboratorio, is_substituto, todos_concorrentes, url_produto, condicao_comercial, updated_at
        FROM belaped_cotacoes_reais
        WHERE ean = ?
        ORDER BY preco ASC
      `).all(eanLimpo);

      const concorrentesConsolidados = [];
      const vistos = new Set();

      cotacoesReais.forEach(cr => {
        if (cr.todos_concorrentes) {
          try {
            const parsed = JSON.parse(cr.todos_concorrentes);
            if (Array.isArray(parsed)) {
              parsed.forEach(c => {
                const k = `${c.ean || ''}_${cr.fornecedor}_${c.preco}`;
                if (!vistos.has(k)) {
                  vistos.add(k);
                  concorrentesConsolidados.push({
                    distribuidora: cr.fornecedor,
                    ean: c.ean || cr.ean_substituto || null,
                    descricao: c.descricao || cr.descricao,
                    laboratorio: c.laboratorio || cr.laboratorio || null,
                    preco: Number(c.preco),
                    isSubstituto: Boolean(c.isSubstituto ?? cr.is_substituto),
                    jaTeveNaLoja: Boolean(c.jaTeveNaLoja),
                    vencedorPortal: (c.ean === cr.ean_substituto)
                  });
                }
              });
            }
          } catch (e) {}
        }

        if (cr.preco > 0 && cr.disponivel === 1) {
          const k = `${cr.ean_substituto || eanLimpo}_${cr.fornecedor}_${cr.preco}`;
          if (!vistos.has(k)) {
            vistos.add(k);
            concorrentesConsolidados.push({
              distribuidora: cr.fornecedor,
              ean: cr.ean_substituto || eanLimpo,
              descricao: cr.descricao,
              laboratorio: cr.laboratorio || null,
              preco: Number(cr.preco),
              isSubstituto: Boolean(cr.is_substituto),
              jaTeveNaLoja: false,
              vencedorPortal: true
            });
          }
        }
      });

      // 3. Histórico de equivalências gravadas
      const equivalencias = db.prepare(`
        SELECT * FROM belaped_equivalencias
        WHERE ean_original = ? OR ean_substituto = ?
        ORDER BY data_vinculo DESC
      `).all(eanLimpo, eanLimpo);

      concorrentesConsolidados.sort((a, b) => a.preco - b.preco);

      res.json({
        success: true,
        ean: eanLimpo,
        produtoOriginal: produtoOriginal || null,
        concorrentes: concorrentesConsolidados,
        cotacoesPorPortal: cotacoesReais.map(cr => ({
          fornecedor: cr.fornecedor,
          preco: cr.preco,
          disponivel: Boolean(cr.disponivel),
          descricao: cr.descricao,
          ean_substituto: cr.ean_substituto,
          laboratorio: cr.laboratorio,
          is_substituto: Boolean(cr.is_substituto),
          url_produto: cr.url_produto,
          condicao_comercial: cr.condicao_comercial,
          updated_at: cr.updated_at
        })),
        equivalencias
      });
    } catch (err) {
      console.error('[BelaPed] Erro ao buscar concorrentes de essência:', err.message);
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
          COALESCE(cr.ean_substituto, c.ean) AS ean_final,
          c.descricao,
          c.saldo,
          c.vmd_ponderado
        FROM compras_estoque_cache c
        LEFT JOIN belaped_cotacoes_reais cr ON cr.ean = c.ean AND cr.fornecedor = 'PROFARMA' AND cr.disponivel = 1
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
        const eanExport = p.ean_final || p.ean;
        csvContent += `${eanExport};${qtd}\r\n`;
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
          COALESCE(cr.ean_substituto, c.ean) AS ean_final,
          c.descricao,
          c.saldo,
          c.vmd_ponderado
        FROM compras_estoque_cache c
        LEFT JOIN belaped_cotacoes_reais cr ON cr.ean = c.ean AND cr.fornecedor = 'DPC DISTRIBUIDORA' AND cr.disponivel = 1
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
        const eanExport = p.ean_final || p.ean;
        csvContent += `${eanExport};${qtd}\r\n`;
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
  // ═══════════════════════════════════════════════════════════════════════════
  // BELAPED: GESTÃO E LIMPEZA ESTRITA DE CARRINHOS (REGRA MASTER DE SEGURANÇA)
  // Garante que todos os portais alvo estejam 100% vazios (0 itens) antes de qualquer montagem.
  // ═══════════════════════════════════════════════════════════════════════════

  function calcularEconomiaItem(item, precoVencedor, dbInstance) {
    let precoUlt = Number(item.preco_ult_compra) || 0;
    if (precoUlt <= 0 && item.ean) {
      try {
        const row = dbInstance.prepare(`SELECT preco_unitario_ult_compra, custo_unitario FROM compras_estoque_cache WHERE ean = ? LIMIT 1`).get(item.ean);
        precoUlt = Number(row?.preco_unitario_ult_compra) || Number(row?.custo_unitario) || 0;
      } catch (e) {}
    }
    const qtd = Number(item.quantidade) || 1;
    const precoAdicionado = Number(precoVencedor) || Number(item.preco_1) || 0;
    const subtotal = Number((precoAdicionado * qtd).toFixed(2));
    const subtotalUltCompra = precoUlt > 0 ? Number((precoUlt * qtd).toFixed(2)) : 0;
    const diferencaReais = precoUlt > 0 ? Number((subtotalUltCompra - subtotal).toFixed(2)) : 0; // >0 economia, <0 gasto a mais
    const variacaoPct = precoUlt > 0 ? Number((((precoAdicionado - precoUlt) / precoUlt) * 100).toFixed(1)) : 0;

    return {
      preco_ult_compra: precoUlt,
      subtotal_ult_compra: subtotalUltCompra,
      diferenca_reais: diferencaReais,
      variacao_pct: variacaoPct
    };
  }

  function consolidarRelatorioFinanceiro(distribuidoraNome, totalSolicitado, adicionados, repassados, semEstoque) {
    const totalAdicionadoReais = Number(adicionados.reduce((acc, c) => acc + (c.subtotal || 0), 0).toFixed(2));
    const totalRepassadoReais = Number(repassados.reduce((acc, c) => acc + (c.subtotal_destino || 0), 0).toFixed(2));

    const itensComparaveis = adicionados.filter(i => (i.preco_ult_compra || 0) > 0);
    const totalUltimaCompraReais = Number(itensComparaveis.reduce((acc, c) => acc + (c.subtotal_ult_compra || 0), 0).toFixed(2));
    const totalAdicionadoComparavel = Number(itensComparaveis.reduce((acc, c) => acc + (c.subtotal || 0), 0).toFixed(2));
    const economiaTotalReais = Number((totalUltimaCompraReais - totalAdicionadoComparavel).toFixed(2));
    const economiaTotalPct = totalUltimaCompraReais > 0 ? Number(((economiaTotalReais / totalUltimaCompraReais) * 100).toFixed(1)) : 0;

    return {
      distribuidora: distribuidoraNome,
      totalSolicitado,
      sucessos: adicionados.length,
      falhas: repassados.length + semEstoque.length,
      totalAdicionadoReais,
      totalRepassadoReais,
      totalUltimaCompraReais,
      economiaTotalReais,
      economiaTotalPct,
      temHistoricoComparavel: itensComparaveis.length > 0,
      itensAdicionados: adicionados,
      itensRepassados2Colocado: repassados,
      itensSemEstoqueGeral: semEstoque
    };
  }

  /**
   * Garante com até 3 retentativas que um robô já iniciado tenha seu carrinho 100% limpo (0 itens).
   * Executa limpeza preventiva antes da verificação para garantir que itens residuais no cache do portal sejam excluídos.
   */
  async function garantirCarrinhoVazioRobo(robot, nomePortal) {
    console.log(`[BelaPed Segurança] 🛡️ Esvaziando preventivamente e verificando carrinho da ${nomePortal.toUpperCase()} (0 itens)...`);
    let limpo = false;
    let ultimoErro = null;

    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      try {
        // Limpeza preventiva imediata
        await robot.limparCarrinho();
        await new Promise(r => setTimeout(r, 1200));

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
  async function garantirCarrinhosVazios(portaisAlvo = ['soton', 'divimed', 'distrimed', 'profarma', 'dpc', 'martins', 'oriente', 'panpharma']) {
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
        case 'oriente': return new OrienteRobot({ headless: true });
        case 'panpharma':
        case 'panfarma': return new PanpharmaRobot();
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

  /**
   * Resolve o repasse de um item que falhou na montagem para o 2º colocado
   */
  function resolverRepasseSegundoColocado(item, distribuidoraAtual, motivoFalha) {
    let segForn = item.fornecedor_2;
    let segPreco = Number(item.preco_2) || 0;

    if (!segForn || segForn === '—' || segForn.includes('Sem Estoque') || segPreco <= 0) {
      try {
        const row = db.prepare(`
          SELECT fornecedor, preco FROM belaped_cotacoes_reais
          WHERE ean = ? AND disponivel = 1 AND preco > 0 AND UPPER(fornecedor) NOT LIKE ?
          ORDER BY preco ASC LIMIT 1
        `).get(item.ean, `%${distribuidoraAtual.toUpperCase()}%`);

        if (row) {
          segForn = row.fornecedor;
          segPreco = Number(row.preco);
        }
      } catch (e) {}
    }

    const temRepasse = segForn && segForn !== '—' && !segForn.includes('Sem Estoque') && segPreco > 0;

    // Invalida SEMPRE no banco a cotação da distribuidora que falhou para que o 2º colocado assuma a liderança (ou marque sem estoque)
    try {
      db.prepare(`
        UPDATE belaped_cotacoes_reais
        SET disponivel = 0, updated_at = datetime('now')
        WHERE ean = ? AND UPPER(fornecedor) LIKE ?
      `).run(item.ean, `%${distribuidoraAtual.toUpperCase()}%`);
    } catch (e) {}

    return {
      status: temRepasse ? 'REPASSADO_2_COLOCADO' : 'SEM_ESTOQUE_GERAL',
      motivo: motivoFalha || (temRepasse ? `Sem estoque na ${distribuidoraAtual} -> Repassado para ${segForn}` : `Sem estoque na ${distribuidoraAtual} e sem cotação nos demais`),
      fornecedor_origem: distribuidoraAtual,
      fornecedor_destino: temRepasse ? segForn : null,
      preco_destino: temRepasse ? segPreco : null,
      subtotal_destino: temRepasse ? Number((segPreco * item.quantidade).toFixed(2)) : 0
    };
  }

  function obterEansBloqueadosCarrinho() {
    return new Set(
      db.prepare(`
        SELECT ean FROM belaped_produtos_regras 
        WHERE (nao_carrinho = 1 OR (adiar_ate IS NOT NULL AND date(adiar_ate) > date('now', 'localtime')))
          AND ean IS NOT NULL
      `).all().map(r => r.ean)
    );
  }

  /**
   * Marca um produto como enviado ao carrinho na semana atual (até a próxima segunda-feira)
   * Assim que o robô confirma que o produto entrou no carrinho do portal.
   */
  function marcarItemEnviadoCarrinhoSemana(item, distribuidora) {
    try {
      const eanLimpo = String(item?.ean || '').trim();
      const pidNum = item?.produto_id ? Number(item.produto_id) : null;
      const chaveRegra = eanLimpo || (pidNum ? `ID_${pidNum}` : null);
      if (!chaveRegra) return;

      const proxSeg = new Date();
      const day = proxSeg.getDay(); // 0=Dom, 1=Seg...
      const diasAteSegunda = day === 0 ? 1 : (8 - day);
      proxSeg.setDate(proxSeg.getDate() + diasAteSegunda);
      const proxSegISO = proxSeg.toISOString().slice(0, 10);

      db.prepare(`
        INSERT INTO belaped_produtos_regras (
          chave_regra, ean, produto_id, descricao, nao_cotar, nao_carrinho,
          motivo_justificativa, enviado_carrinho_ate, atualizado_por, atualizado_em
        ) VALUES (
          @chave_regra, @ean, @produto_id, @descricao, 0, 0,
          @motivo, @enviado_ate, 'Robô Carrinho', datetime('now', 'localtime')
        )
        ON CONFLICT(chave_regra) DO UPDATE SET
          ean = COALESCE(excluded.ean, belaped_produtos_regras.ean),
          produto_id = COALESCE(excluded.produto_id, belaped_produtos_regras.produto_id),
          descricao = COALESCE(excluded.descricao, belaped_produtos_regras.descricao),
          enviado_carrinho_ate = excluded.enviado_carrinho_ate,
          atualizado_por = excluded.atualizado_por,
          atualizado_em = excluded.atualizado_em
      `).run({
        chave_regra: chaveRegra,
        ean: eanLimpo || null,
        produto_id: pidNum,
        descricao: item?.descricao || '',
        motivo: `Enviado ao carrinho (${distribuidora})`,
        enviado_ate: proxSegISO
      });
    } catch (e) {
      console.warn('[BelaPed] Aviso ao marcar item enviado ao carrinho na semana:', e.message);
    }
  }

  /**
   * POST /api/belaped/buscar-imagem-produto
   * Busca e salva automaticamente a foto real do produto (Napp -> Bing Images -> DuckDuckGo -> Cosmos CDN)
   * com validação estrita de assinatura de arquivo (magic bytes) para impedir HTML/Cloudflare corrompido.
   */
  router.post('/buscar-imagem-produto', async (req, res) => {
    try {
      const { produto_id, ean, descricao, forcar } = req.body || {};
      const pId = Number(produto_id) || 0;
      const cleanEan = String(ean || '').trim();
      const desc = String(descricao || '').trim();

      if (!pId && !cleanEan && !desc) {
        return res.status(400).json({ success: false, error: 'Informe produto_id, ean ou descricao.' });
      }

      const isValidImageBuffer = (buf) => {
        if (!buf || !Buffer.isBuffer(buf) || buf.length < 1200) return false;
        const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
        const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
        const isWebp = buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46;
        const isGif = buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46;
        return isJpeg || isPng || isWebp || isGif;
      };

      const uploadsDir = path.join(__dirname, 'uploads', 'produtos');
      const publicUploadsDir = path.join(__dirname, '../public/uploads/produtos');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      if (!fs.existsSync(publicUploadsDir)) fs.mkdirSync(publicUploadsDir, { recursive: true });

      const fileKey = pId > 0 ? String(pId) : (cleanEan || String(Date.now()));
      const fileName = `${fileKey}.jpg`;
      const destPath = path.join(uploadsDir, fileName);
      const destPublic = path.join(publicUploadsDir, fileName);

      // 1. Verifica se já existe em disco (validando magic bytes para remover eventual HTML corrompido)
      if (!forcar) {
        for (const pCheck of [destPublic, destPath]) {
          if (fs.existsSync(pCheck)) {
            try {
              const bExist = fs.readFileSync(pCheck);
              if (isValidImageBuffer(bExist)) {
                return res.json({ success: true, imagem_url: `/uploads/produtos/${fileName}` });
              } else {
                try { fs.unlinkSync(pCheck); } catch (e) {}
              }
            } catch (e) {}
          }
        }
      }

      // 2. Tenta catálogo Napp (scraped_images) se não for forçado
      if (!forcar) {
        try {
          let nappRow = null;
          if (cleanEan.length >= 7) {
            nappRow = db.prepare(`SELECT image_url FROM scraped_images WHERE ean = ? AND image_url IS NOT NULL AND image_url != ''`).get(cleanEan);
          }
          if (!nappRow && desc.length >= 4) {
            const words = desc.split(/\s+/).filter(w => w.length >= 3).slice(0, 2);
            if (words.length >= 2) {
              nappRow = db.prepare(`SELECT image_url FROM scraped_images WHERE name LIKE ? AND name LIKE ? AND image_url IS NOT NULL AND image_url != '' LIMIT 1`).get(`%${words[0]}%`, `%${words[1]}%`);
            } else if (words.length === 1) {
              nappRow = db.prepare(`SELECT image_url FROM scraped_images WHERE name LIKE ? AND image_url IS NOT NULL AND image_url != '' LIMIT 1`).get(`%${words[0]}%`);
            }
          }
          if (nappRow && nappRow.image_url) {
            if (!nappRow.image_url.startsWith('/uploads/produtos/') || fs.existsSync(path.join(__dirname, '..', 'public', nappRow.image_url))) {
              return res.json({ success: true, imagem_url: nappRow.image_url });
            }
          }
        } catch (e) {}
      }

      const salvarBufferFoto = (buffer) => {
        fs.writeFileSync(destPath, buffer);
        try { fs.writeFileSync(destPublic, buffer); } catch (e) {}
        const urlRel = `/uploads/produtos/${fileName}`;
        try {
          if (cleanEan.length >= 7) {
            db.prepare(`INSERT OR REPLACE INTO scraped_images (ean, name, image_url, last_updated) VALUES (?, ?, ?, datetime('now'))`).run(cleanEan, desc || cleanEan, urlRel);
          }
        } catch (e) {}
        try {
          if (pId > 0) {
            db.prepare(`UPDATE compras_estoque_cache SET imagem_url = ? WHERE produto_id = ?`).run(urlRel, pId);
          }
        } catch (e) {}
        return urlRel;
      };

      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
      const cleanDesc = desc.replace(/[^\w\sÀ-ÿ0-9]/gi, ' ').replace(/\s+/g, ' ').trim();
      const queryTerms = [];
      if (cleanEan.length >= 7 && cleanDesc) {
        queryTerms.push(`${cleanEan} ${cleanDesc}`);
      }
      if (cleanEan.length >= 7) {
        queryTerms.push(`${cleanEan} farmacia`);
      }
      if (cleanDesc) {
        queryTerms.push(`${cleanDesc} produto farmacia`);
      }

      // 3. Tenta Bing Image Search (rápido e sem bloqueio Cloudflare)
      for (const q of queryTerms) {
        try {
          const bingUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(q)}&form=HDRSC2`;
          const bRes = await fetch(bingUrl, {
            headers: { 'User-Agent': ua, 'Accept-Language': 'pt-BR,pt;q=0.9' },
            signal: AbortSignal.timeout(4500)
          });
          if (bRes.ok) {
            const html = await bRes.text();
            const urlsCandidatas = [];
            const murlMatches = [...html.matchAll(/murl&quot;:&quot;(https?:\/\/[^&]+?)&quot;/g)];
            for (const m of murlMatches.slice(0, 4)) {
              if (m[1]) urlsCandidatas.push(m[1]);
            }
            const turlMatches = [...html.matchAll(/turl&quot;:&quot;(https?:\/\/[^&]+?)&quot;/g)];
            for (const t of turlMatches.slice(0, 3)) {
              if (t[1]) urlsCandidatas.push(t[1]);
            }

            for (const candidateUrl of urlsCandidatas) {
              try {
                const imgRes = await fetch(candidateUrl, {
                  headers: { 'User-Agent': ua },
                  signal: AbortSignal.timeout(4000)
                });
                if (imgRes.ok) {
                  const buffer = Buffer.from(await imgRes.arrayBuffer());
                  if (isValidImageBuffer(buffer)) {
                    const urlSalva = salvarBufferFoto(buffer);
                    return res.json({ success: true, imagem_url: urlSalva });
                  }
                }
              } catch (eImg) {}
            }
          }
        } catch (eBing) {}
      }

      // 4. Tenta DuckDuckGo Image Search por EAN + Descrição
      for (const q of queryTerms) {
        try {
          const tokenUrl = 'https://duckduckgo.com/?q=' + encodeURIComponent(q);
          const r1 = await fetch(tokenUrl, { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(4000) });
          const html = await r1.text();
          const vqdMatch = html.match(/vqd=([\d-]+)/);
          if (!vqdMatch) continue;
          const vqd = vqdMatch[1];
          const imgUrl = 'https://duckduckgo.com/i.js?l=wt-wt&o=json&q=' + encodeURIComponent(q) + '&vqd=' + vqd + '&f=,,,';
          const r2 = await fetch(imgUrl, { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(4000) });
          const data = await r2.json();
          if (data.results && data.results.length > 0) {
            for (const itemRes of data.results.slice(0, 3)) {
              try {
                const imgRes = await fetch(itemRes.image, { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(4500) });
                if (imgRes.ok) {
                  const buffer = Buffer.from(await imgRes.arrayBuffer());
                  if (isValidImageBuffer(buffer)) {
                    const urlSalva = salvarBufferFoto(buffer);
                    return res.json({ success: true, imagem_url: urlSalva });
                  }
                }
              } catch (e) {}
            }
          }
        } catch (e) {}
      }

      // 5. Tenta CDN Bluesoft Cosmos por EAN (com validação de magic bytes)
      if (cleanEan.length >= 7) {
        try {
          const cosmosUrl = `https://cdn-cosmos.bluesoft.com.br/products/${cleanEan}`;
          const cosmosRes = await fetch(cosmosUrl, {
            headers: { 'User-Agent': ua },
            signal: AbortSignal.timeout(4000)
          });
          if (cosmosRes.ok) {
            const buffer = Buffer.from(await cosmosRes.arrayBuffer());
            if (isValidImageBuffer(buffer)) {
              const urlSalva = salvarBufferFoto(buffer);
              return res.json({ success: true, imagem_url: urlSalva });
            }
          }
        } catch (e) {}
      }

      return res.json({ success: false, imagem_url: null });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  // Estado de montagem do carrinho na Soton
  const sotonCarrinhoStatus = {
    emAndamento: false,
    total: 0,
    atual: 0,
    sucessos: 0,
    erros: 0,
    ultimoItem: '',
    itens: [],
    relatorio: null
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

      // Filtra produtos marcados com "Não colocar no carrinho" ou "Adiado para próxima semana"
      const eansNaoCarrinho = obterEansBloqueadosCarrinho();
      itensParaAdicionar = itensParaAdicionar.filter(it => !eansNaoCarrinho.has(it.ean) && !it.nao_carrinho);

      // Se não passou lista explícita, seleciona os itens de ruptura onde Soton é o 1º colocado
      if (!Array.isArray(itensParaAdicionar) || itensParaAdicionar.length === 0) {
        const produtosGanhadores = db.prepare(`
          SELECT 
            c.ean,
            COALESCE(cr.ean_substituto, c.ean) AS ean_substituto,
            c.descricao, 
            c.saldo, 
            c.vmd_ponderado, 
            c.preco_unitario_ult_compra,
            c.custo_unitario,
            cr.preco
          FROM compras_estoque_cache c
          JOIN belaped_cotacoes_reais cr ON cr.ean = c.ean AND cr.fornecedor = 'SOTON FARMA' AND cr.disponivel = 1
          WHERE c.ean IS NOT NULL AND length(c.ean) >= 7
            AND (c.saldo <= 0 OR c.saldo < c.est_minimo_calculado)
            AND c.curva_abc IN ('A', 'B')
            AND c.ean NOT IN (SELECT ean FROM belaped_produtos_regras WHERE nao_carrinho = 1 AND ean IS NOT NULL)
          ORDER BY (c.saldo <= 0) DESC, c.vmd_ponderado DESC
          LIMIT 50
        `).all();

        itensParaAdicionar = produtosGanhadores.map(p => {
          const vmd = Number(p.vmd_ponderado) || 0;
          const saldo = Number(p.saldo) || 0;
          const necessidade7d = Math.ceil(vmd * 7 * 1.15);
          const qtd = saldo <= 0 ? Math.max(1, Math.abs(saldo) + necessidade7d) : Math.max(1, necessidade7d - saldo);
          return {
            ean: p.ean,
            ean_substituto: p.ean_substituto,
            quantidade: qtd,
            descricao: p.descricao,
            preco_1: p.preco,
            preco_ult_compra: Number(p.preco_unitario_ult_compra) || Number(p.custo_unitario) || 0
          };
        });
      }

      if (itensParaAdicionar.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Nenhum produto vencedor na Soton Farma para adicionar ao carrinho no momento (ou itens bloqueados).'
        });
      }

      sotonCarrinhoStatus.emAndamento = true;
      sotonCarrinhoStatus.total = itensParaAdicionar.length;
      sotonCarrinhoStatus.atual = 0;
      sotonCarrinhoStatus.sucessos = 0;
      sotonCarrinhoStatus.erros = 0;
      sotonCarrinhoStatus.ultimoItem = '';
      sotonCarrinhoStatus.itens = [];
      sotonCarrinhoStatus.relatorio = null;

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
            sotonCarrinhoStatus.ultimoItem = `${item.descricao || item.ean} (Qtd: ${item.quantidade})`;

            const eanParaAdicionar = item.ean_substituto || item.ean;
            console.log(`[BelaPed Carrinho Soton] Adicionando EAN ${eanParaAdicionar} (${item.descricao || ''}) - Qtd ${item.quantidade}...`);
            const resItem = await robot.adicionarAoCarrinho(eanParaAdicionar, item.quantidade, item.descricao);
            const finItem = calcularEconomiaItem(item, item.preco_1, db);

            if (resItem.sucesso) {
              sotonCarrinhoStatus.sucessos++;
              marcarItemEnviadoCarrinhoSemana(item, 'SOTON FARMA');
              sotonCarrinhoStatus.itens.push({
                ean: item.ean,
                ean_substituto: item.ean_substituto || null,
                descricao: item.descricao || '',
                quantidade: item.quantidade,
                preco_1: Number(item.preco_1) || 0,
                subtotal: Number(((Number(item.preco_1) || 0) * item.quantidade).toFixed(2)),
                fornecedor: 'SOTON FARMA',
                status: 'ADICIONADO',
                preco_ult_compra: finItem.preco_ult_compra,
                subtotal_ult_compra: finItem.subtotal_ult_compra,
                diferenca_reais: finItem.diferenca_reais,
                variacao_pct: finItem.variacao_pct
              });
            } else {
              sotonCarrinhoStatus.erros++;
              const infoRepasse = resolverRepasseSegundoColocado(item, 'SOTON FARMA', resItem.motivo);
              sotonCarrinhoStatus.itens.push({
                ean: item.ean,
                descricao: item.descricao || '',
                quantidade: item.quantidade,
                preco_1: Number(item.preco_1) || 0,
                preco_ult_compra: finItem.preco_ult_compra,
                subtotal_ult_compra: finItem.subtotal_ult_compra,
                diferenca_reais: finItem.diferenca_reais,
                variacao_pct: finItem.variacao_pct,
                ...infoRepasse
              });
            }
          }

          // Monta o Relatório Estruturado Final com Análise Financeira vs Última Compra
          const adicionados = sotonCarrinhoStatus.itens.filter(i => i.status === 'ADICIONADO');
          const repassados = sotonCarrinhoStatus.itens.filter(i => i.status === 'REPASSADO_2_COLOCADO');
          const semEstoque = sotonCarrinhoStatus.itens.filter(i => i.status === 'SEM_ESTOQUE_GERAL');

          sotonCarrinhoStatus.relatorio = consolidarRelatorioFinanceiro(
            'SOTON FARMA',
            itensParaAdicionar.length,
            adicionados,
            repassados,
            semEstoque
          );

          // Salva pedido formal no banco de dados belaped_pedidos
          if (adicionados.length > 0) {
            try {
              const pedidoId = 'PED-SOTON-' + Date.now();
              const totalAdicionadoReais = sotonCarrinhoStatus.relatorio?.totalAdicionadoReais || 0;
              db.prepare(`
                INSERT INTO belaped_pedidos (id, distribuidora, status, total, qtd_itens, qtd_unidades, observacoes)
                VALUES (?, 'SOTON FARMA', 'CARRINHO_GERADO', ?, ?, ?, ?)
              `).run(
                pedidoId,
                totalAdicionadoReais,
                adicionados.length,
                adicionados.reduce((acc, c) => acc + c.quantidade, 0),
                JSON.stringify({ sucessos: adicionados.length, repassados: repassados.length, semEstoque: semEstoque.length })
              );

              const insItem = db.prepare(`
                INSERT INTO belaped_pedidos_itens (pedido_id, ean, descricao, qtd_pedida, preco_cotado)
                VALUES (?, ?, ?, ?, ?)
              `);
              for (const it of adicionados) {
                insItem.run(pedidoId, it.ean, it.descricao || '', it.quantidade, it.preco_1 || 0);
              }
            } catch (pErr) {
              console.error('[BelaPed] Erro ao salvar pedido Soton no banco:', pErr.message);
            }
          }

          console.log(`[BelaPed Carrinho Soton] Concluído: ${adicionados.length} adicionados, ${repassados.length} repassados p/ 2º colocado.`);
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
    itens: [],
    relatorio: null
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

      // Filtra produtos marcados expressamente com "Não colocar no carrinho"
      const eansNaoCarrinho = obterEansBloqueadosCarrinho();
      itensParaAdicionar = itensParaAdicionar.filter(it => !eansNaoCarrinho.has(it.ean) && !it.nao_carrinho);

      // Se não passou lista explícita, seleciona os itens de ruptura onde Divimed é a vencedora
      if (!Array.isArray(itensParaAdicionar) || itensParaAdicionar.length === 0) {
        const produtosGanhadores = db.prepare(`
          SELECT 
            c.ean,
            COALESCE(cr.ean_substituto, c.ean) AS ean_substituto,
            c.descricao,
            c.saldo,
            c.vmd_ponderado,
            c.preco_unitario_ult_compra,
            c.custo_unitario,
            cr.preco
          FROM compras_estoque_cache c
          JOIN belaped_cotacoes_reais cr ON cr.ean = c.ean AND cr.fornecedor = 'DIVIMED' AND cr.disponivel = 1
          WHERE c.ean IS NOT NULL AND length(c.ean) >= 7
            AND (c.saldo <= 0 OR c.saldo < c.est_minimo_calculado)
            AND c.curva_abc IN ('A', 'B')
            AND c.ean NOT IN (SELECT ean FROM belaped_produtos_regras WHERE nao_carrinho = 1 AND ean IS NOT NULL)
          ORDER BY (c.saldo <= 0) DESC, c.vmd_ponderado DESC
          LIMIT 50
        `).all();

        itensParaAdicionar = produtosGanhadores.map(p => {
          const vmd = Number(p.vmd_ponderado) || 0;
          const saldo = Number(p.saldo) || 0;
          const necessidade7d = Math.ceil(vmd * 7 * 1.15);
          const qtd = saldo <= 0 ? Math.max(1, Math.abs(saldo) + necessidade7d) : Math.max(1, necessidade7d - saldo);
          return {
            ean: p.ean,
            ean_substituto: p.ean_substituto,
            quantidade: qtd,
            descricao: p.descricao,
            preco_1: p.preco,
            preco_ult_compra: Number(p.preco_unitario_ult_compra) || Number(p.custo_unitario) || 0
          };
        });
      }

      if (itensParaAdicionar.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Nenhum produto vencedor na Divimed para adicionar ao carrinho no momento (ou itens bloqueados).'
        });
      }

      divimedCarrinhoStatus.emAndamento = true;
      divimedCarrinhoStatus.total = itensParaAdicionar.length;
      divimedCarrinhoStatus.atual = 0;
      divimedCarrinhoStatus.sucessos = 0;
      divimedCarrinhoStatus.erros = 0;
      divimedCarrinhoStatus.ultimoItem = '';
      divimedCarrinhoStatus.itens = [];
      divimedCarrinhoStatus.relatorio = null;

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

            const eanParaAdicionar = item.ean_substituto || item.ean;
            console.log(`[BelaPed Carrinho Divimed] Adicionando ${eanParaAdicionar} (${item.descricao || ''}) - Qtd ${item.quantidade}...`);
            const resItem = await robot.adicionarAoCarrinho(eanParaAdicionar, item.quantidade, item.descricao);
            const finItem = calcularEconomiaItem(item, item.preco_1, db);

            if (resItem.sucesso) {
              divimedCarrinhoStatus.sucessos++;
              marcarItemEnviadoCarrinhoSemana(item, 'DIVIMED');
              divimedCarrinhoStatus.itens.push({
                ean: item.ean,
                ean_substituto: item.ean_substituto || null,
                descricao: item.descricao || '',
                quantidade: item.quantidade,
                preco_1: Number(item.preco_1) || 0,
                subtotal: Number(((Number(item.preco_1) || 0) * item.quantidade).toFixed(2)),
                fornecedor: 'DIVIMED',
                status: 'ADICIONADO',
                preco_ult_compra: finItem.preco_ult_compra,
                subtotal_ult_compra: finItem.subtotal_ult_compra,
                diferenca_reais: finItem.diferenca_reais,
                variacao_pct: finItem.variacao_pct
              });
            } else {
              divimedCarrinhoStatus.erros++;
              const infoRepasse = resolverRepasseSegundoColocado(item, 'DIVIMED', resItem.motivo);
              divimedCarrinhoStatus.itens.push({
                ean: item.ean,
                descricao: item.descricao || '',
                quantidade: item.quantidade,
                preco_1: Number(item.preco_1) || 0,
                preco_ult_compra: finItem.preco_ult_compra,
                subtotal_ult_compra: finItem.subtotal_ult_compra,
                diferenca_reais: finItem.diferenca_reais,
                variacao_pct: finItem.variacao_pct,
                ...infoRepasse
              });
            }
          }

          // Monta o Relatório Estruturado Final com Análise Financeira vs Última Compra
          const adicionados = divimedCarrinhoStatus.itens.filter(i => i.status === 'ADICIONADO');
          const repassados = divimedCarrinhoStatus.itens.filter(i => i.status === 'REPASSADO_2_COLOCADO');
          const semEstoque = divimedCarrinhoStatus.itens.filter(i => i.status === 'SEM_ESTOQUE_GERAL');

          divimedCarrinhoStatus.relatorio = consolidarRelatorioFinanceiro(
            'DIVIMED',
            itensParaAdicionar.length,
            adicionados,
            repassados,
            semEstoque
          );

          // Salva pedido formal no banco de dados belaped_pedidos
          if (adicionados.length > 0) {
            try {
              const pedidoId = 'PED-DIVIMED-' + Date.now();
              const totalAdicionadoReais = divimedCarrinhoStatus.relatorio?.totalAdicionadoReais || 0;
              db.prepare(`
                INSERT INTO belaped_pedidos (id, distribuidora, status, total, qtd_itens, qtd_unidades, observacoes)
                VALUES (?, 'DIVIMED', 'CARRINHO_GERADO', ?, ?, ?, ?)
              `).run(
                pedidoId,
                totalAdicionadoReais,
                adicionados.length,
                adicionados.reduce((acc, c) => acc + c.quantidade, 0),
                JSON.stringify({ sucessos: adicionados.length, repassados: repassados.length, semEstoque: semEstoque.length })
              );

              const insItem = db.prepare(`
                INSERT INTO belaped_pedidos_itens (pedido_id, ean, descricao, qtd_pedida, preco_cotado)
                VALUES (?, ?, ?, ?, ?)
              `);
              for (const it of adicionados) {
                insItem.run(pedidoId, it.ean, it.descricao || '', it.quantidade, it.preco_1 || 0);
              }
            } catch (pErr) {
              console.error('[BelaPed] Erro ao salvar pedido Divimed no banco:', pErr.message);
            }
          }

          console.log(`[BelaPed Carrinho Divimed] Concluído: ${adicionados.length} adicionados, ${repassados.length} repassados p/ 2º colocado.`);
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
   * GET /api/belaped/baixar-relatorio-prioridades
   * Download direto da planilha Excel de prioridades (.xlsx) com cabeçalhos forçados de anexo
   */
  router.get('/baixar-relatorio-prioridades', (req, res) => {
    try {
      const filePath = path.join(__dirname, '../public/relatorio-prioridades-belaped.xlsx');
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: 'Arquivo de relatório não encontrado no servidor.' });
      }
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="relatorio-prioridades-belaped.xlsx"');
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (err) {
      console.error('[BelaPed] Erro ao servir planilha de prioridades:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
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
          COALESCE(cr.ean_substituto, c.ean) AS ean_final,
          c.descricao,
          c.saldo,
          c.vmd_ponderado
        FROM compras_estoque_cache c
        LEFT JOIN belaped_cotacoes_reais cr ON cr.ean = c.ean AND cr.fornecedor = 'DISTRIMED' AND cr.disponivel = 1
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
        const eanExport = p.ean_final || p.ean;
        csvContent += `${eanExport};${qtd}\r\n`;
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
    sucesso: false,
    total: 0,
    atual: 0,
    sucessos: 0,
    erros: 0,
    itens: [],
    relatorio: null
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

      let itensParaAdicionar = req.body.itens || [];

      // Filtra produtos marcados expressamente com "Não colocar no carrinho"
      const eansNaoCarrinho = obterEansBloqueadosCarrinho();
      itensParaAdicionar = itensParaAdicionar.filter(it => !eansNaoCarrinho.has(it.ean) && !it.nao_carrinho);

      // Se não passou lista explícita, seleciona os itens de ruptura onde Distrimed é a vencedora
      if (!Array.isArray(itensParaAdicionar) || itensParaAdicionar.length === 0) {
        const produtos = db.prepare(`
          SELECT 
            c.ean,
            COALESCE(cr.ean_substituto, c.ean) AS ean_substituto,
            c.descricao,
            c.saldo,
            c.vmd_ponderado,
            c.preco_unitario_ult_compra,
            c.custo_unitario,
            cr.preco
          FROM compras_estoque_cache c
          JOIN belaped_cotacoes_reais cr ON cr.ean = c.ean AND cr.fornecedor = 'DISTRIMED' AND cr.disponivel = 1
          WHERE c.ean IS NOT NULL AND length(c.ean) >= 7
            AND (c.saldo <= 0 OR c.saldo < c.est_minimo_calculado)
            AND c.curva_abc IN ('A', 'B')
            AND c.ean NOT IN (SELECT ean FROM belaped_produtos_regras WHERE nao_carrinho = 1 AND ean IS NOT NULL)
          ORDER BY (c.saldo <= 0) DESC, c.vmd_ponderado DESC
          LIMIT 60
        `).all();

        itensParaAdicionar = produtos.map(p => {
          const vmd = Number(p.vmd_ponderado) || 0;
          const saldo = Number(p.saldo) || 0;
          const necessidade7d = Math.ceil(vmd * 7 * 1.15);
          const qtd = saldo <= 0 ? Math.max(1, Math.abs(saldo) + necessidade7d) : Math.max(1, necessidade7d - saldo);
          return {
            ean: p.ean,
            ean_substituto: p.ean_substituto,
            quantidade: qtd,
            descricao: p.descricao,
            preco_1: p.preco,
            preco_ult_compra: Number(p.preco_unitario_ult_compra) || Number(p.custo_unitario) || 0
          };
        });
      }

      if (itensParaAdicionar.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Nenhum produto vencedor na Distrimed para importar no carrinho (ou itens bloqueados).'
        });
      }

      distrimedImportStatus.emAndamento = true;
      distrimedImportStatus.mensagem = 'Iniciando robô Distrimed...';
      distrimedImportStatus.iniciadoEm = new Date().toISOString();
      distrimedImportStatus.sucesso = false;
      distrimedImportStatus.total = itensParaAdicionar.length;
      distrimedImportStatus.atual = 0;
      distrimedImportStatus.sucessos = 0;
      distrimedImportStatus.erros = 0;
      distrimedImportStatus.itens = [];
      distrimedImportStatus.relatorio = null;

      // Gera arquivo temporário no disco
      const tempPath = path.resolve(__dirname, 'pedido_temp_distrimed.csv');
      let csvContent = 'EAN;Quantidade\r\n';
      for (const p of itensParaAdicionar) {
        const eanFinal = p.ean_substituto || p.ean;
        csvContent += `${eanFinal};${p.quantidade}\r\n`;
      }
      fs.writeFileSync(tempPath, csvContent, 'utf-8');

      res.json({
        success: true,
        message: `Robô Distrimed iniciado para realizar o upload de ${itensParaAdicionar.length} produtos na modal de carrinho!`
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

          if (resultado.sucesso) {
            const adicionados = itensParaAdicionar.map(it => {
              marcarItemEnviadoCarrinhoSemana(it, 'DISTRIMED');
              const finItem = calcularEconomiaItem(it, it.preco_1, db);
              return {
                ean: it.ean,
                descricao: it.descricao || '',
                quantidade: it.quantidade,
                preco_1: Number(it.preco_1) || 0,
                subtotal: Number(((Number(it.preco_1) || 0) * it.quantidade).toFixed(2)),
                fornecedor: 'DISTRIMED',
                status: 'ADICIONADO',
                preco_ult_compra: finItem.preco_ult_compra,
                subtotal_ult_compra: finItem.subtotal_ult_compra,
                diferenca_reais: finItem.diferenca_reais,
                variacao_pct: finItem.variacao_pct
              };
            });

            distrimedImportStatus.atual = adicionados.length;
            distrimedImportStatus.sucessos = adicionados.length;
            distrimedImportStatus.itens = adicionados;

            distrimedImportStatus.relatorio = consolidarRelatorioFinanceiro(
              'DISTRIMED',
              itensParaAdicionar.length,
              adicionados,
              [],
              []
            );

            // Salva pedido formal no banco de dados belaped_pedidos
            try {
              const pedidoId = 'PED-DISTRIMED-' + Date.now();
              const totalAdicionadoReais = distrimedImportStatus.relatorio?.totalAdicionadoReais || 0;
              db.prepare(`
                INSERT INTO belaped_pedidos (id, distribuidora, status, total, qtd_itens, qtd_unidades, observacoes)
                VALUES (?, 'DISTRIMED', 'ARQUIVO_IMPORTADO', ?, ?, ?, ?)
              `).run(
                pedidoId,
                totalAdicionadoReais,
                adicionados.length,
                adicionados.reduce((acc, c) => acc + c.quantidade, 0),
                JSON.stringify({ sucessos: adicionados.length, repassados: 0, semEstoque: 0 })
              );

              const insItem = db.prepare(`
                INSERT INTO belaped_pedidos_itens (pedido_id, ean, descricao, qtd_pedida, preco_cotado)
                VALUES (?, ?, ?, ?, ?)
              `);
              for (const it of adicionados) {
                insItem.run(pedidoId, it.ean, it.descricao || '', it.quantidade, it.preco_1 || 0);
              }
            } catch (pErr) {
              console.error('[BelaPed] Erro ao salvar pedido Distrimed no banco:', pErr.message);
            }
          }
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
    itens: [],
    relatorio: null
  };

  /**
   * POST /api/belaped/montar-carrinho-dpc
   * Inicia o robô Puppeteer para adicionar produto a produto no carrinho da DPC Distribuidora
   */
  router.post('/montar-carrinho-dpc', async (req, res) => {
    try {
      if (dpcCarrinhoStatus.emAndamento) {
        return res.status(400).json({ success: false, message: 'Uma montagem de carrinho na DPC já está em andamento.' });
      }

      let itensParaAdicionar = req.body.itens || [];

      // Filtra produtos bloqueados nas regras
      const eansNaoCarrinho = obterEansBloqueadosCarrinho();
      itensParaAdicionar = itensParaAdicionar.filter(it => !eansNaoCarrinho.has(it.ean) && !it.nao_carrinho);

      if (!Array.isArray(itensParaAdicionar) || itensParaAdicionar.length === 0) {
        const produtosGanhadores = db.prepare(`
          SELECT 
            c.ean, 
            COALESCE(cr.ean_substituto, c.ean) AS ean_substituto,
            c.descricao, 
            c.saldo, 
            c.vmd_ponderado, 
            c.preco_unitario_ult_compra,
            c.custo_unitario,
            cr.preco
          FROM compras_estoque_cache c
          JOIN belaped_cotacoes_reais cr ON cr.ean = c.ean AND cr.fornecedor = 'DPC DISTRIBUIDORA' AND cr.disponivel = 1
          WHERE c.ean IS NOT NULL AND length(c.ean) >= 7
            AND (c.saldo <= 0 OR c.saldo < c.est_minimo_calculado)
            AND c.curva_abc IN ('A', 'B')
            AND c.ean NOT IN (SELECT ean FROM belaped_produtos_regras WHERE nao_carrinho = 1 AND ean IS NOT NULL)
          ORDER BY (c.saldo <= 0) DESC, c.vmd_ponderado DESC
          LIMIT 50
        `).all();

        itensParaAdicionar = produtosGanhadores.map(p => {
          const vmd = Number(p.vmd_ponderado) || 0;
          const saldo = Number(p.saldo) || 0;
          const necessidade7d = Math.ceil(vmd * 7 * 1.15);
          const qtd = saldo <= 0 ? Math.max(1, Math.abs(saldo) + necessidade7d) : Math.max(1, necessidade7d - saldo);
          return {
            ean: p.ean,
            ean_substituto: p.ean_substituto,
            quantidade: qtd,
            descricao: p.descricao,
            preco_1: p.preco,
            preco_ult_compra: Number(p.preco_unitario_ult_compra) || Number(p.custo_unitario) || 0
          };
        });
      }

      if (itensParaAdicionar.length === 0) {
        return res.status(400).json({ success: false, message: 'Nenhum produto vencedor na DPC para adicionar ao carrinho no momento (ou itens bloqueados).' });
      }

      dpcCarrinhoStatus.emAndamento = true;
      dpcCarrinhoStatus.total = itensParaAdicionar.length;
      dpcCarrinhoStatus.atual = 0;
      dpcCarrinhoStatus.sucessos = 0;
      dpcCarrinhoStatus.erros = 0;
      dpcCarrinhoStatus.ultimoItem = '';
      dpcCarrinhoStatus.itens = [];
      dpcCarrinhoStatus.relatorio = null;

      res.json({
        success: true,
        message: `Montagem de carrinho iniciada na DPC com ${itensParaAdicionar.length} produtos.`,
        status: dpcCarrinhoStatus
      });

      (async () => {
        let robot = null;
        try {
          console.log('[BelaPed] Iniciando robô DPC para montagem de carrinho...');
          robot = new DpcRobot({ headless: true });
          await robot.iniciar();

          // 🛡️ REGRA CRÍTICA: Validação e esvaziamento prévio obrigatório
          dpcCarrinhoStatus.ultimoItem = 'Garantindo carrinho limpo com 0 itens...';
          await garantirCarrinhoVazioRobo(robot, 'dpc');

          for (let i = 0; i < itensParaAdicionar.length; i++) {
            const item = itensParaAdicionar[i];
            dpcCarrinhoStatus.atual = i + 1;
            dpcCarrinhoStatus.ultimoItem = `${item.descricao || item.ean} (Qtd: ${item.quantidade})`;

            const eanParaAdicionar = item.ean_substituto || item.ean;
            console.log(`[BelaPed Carrinho DPC] Adicionando ${eanParaAdicionar} (${item.descricao || ''}) - Qtd ${item.quantidade}...`);
            const resItem = await robot.adicionarAoCarrinho(eanParaAdicionar, item.quantidade, item.descricao);
            const finItem = calcularEconomiaItem(item, item.preco_1, db);

            if (resItem.sucesso) {
              dpcCarrinhoStatus.sucessos++;
              marcarItemEnviadoCarrinhoSemana(item, 'DPC DISTRIBUIDORA');
              dpcCarrinhoStatus.itens.push({
                ean: item.ean,
                ean_substituto: item.ean_substituto || null,
                descricao: item.descricao || '',
                quantidade: item.quantidade,
                preco_1: Number(item.preco_1) || 0,
                subtotal: Number(((Number(item.preco_1) || 0) * item.quantidade).toFixed(2)),
                fornecedor: 'DPC DISTRIBUIDORA',
                status: 'ADICIONADO',
                preco_ult_compra: finItem.preco_ult_compra,
                subtotal_ult_compra: finItem.subtotal_ult_compra,
                diferenca_reais: finItem.diferenca_reais,
                variacao_pct: finItem.variacao_pct
              });
            } else {
              dpcCarrinhoStatus.erros++;
              const infoRepasse = resolverRepasseSegundoColocado(item, 'DPC DISTRIBUIDORA', resItem.motivo);
              dpcCarrinhoStatus.itens.push({
                ean: item.ean,
                descricao: item.descricao || '',
                quantidade: item.quantidade,
                preco_1: Number(item.preco_1) || 0,
                preco_ult_compra: finItem.preco_ult_compra,
                subtotal_ult_compra: finItem.subtotal_ult_compra,
                diferenca_reais: finItem.diferenca_reais,
                variacao_pct: finItem.variacao_pct,
                ...infoRepasse
              });
            }
          }

          // Monta o Relatório Estruturado Final com Análise Financeira vs Última Compra
          const adicionados = dpcCarrinhoStatus.itens.filter(i => i.status === 'ADICIONADO');
          const repassados = dpcCarrinhoStatus.itens.filter(i => i.status === 'REPASSADO_2_COLOCADO');
          const semEstoque = dpcCarrinhoStatus.itens.filter(i => i.status === 'SEM_ESTOQUE_GERAL');

          dpcCarrinhoStatus.relatorio = consolidarRelatorioFinanceiro(
            'DPC DISTRIBUIDORA',
            itensParaAdicionar.length,
            adicionados,
            repassados,
            semEstoque
          );

          if (adicionados.length > 0) {
            try {
              const pedidoId = 'PED-DPC-' + Date.now();
              const totalAdicionadoReais = dpcCarrinhoStatus.relatorio?.totalAdicionadoReais || 0;
              db.prepare(`
                INSERT INTO belaped_pedidos (id, distribuidora, status, total, qtd_itens, qtd_unidades, observacoes)
                VALUES (?, 'DPC DISTRIBUIDORA', 'CARRINHO_GERADO', ?, ?, ?, ?)
              `).run(
                pedidoId,
                totalAdicionadoReais,
                adicionados.length,
                adicionados.reduce((acc, c) => acc + c.quantidade, 0),
                JSON.stringify({ sucessos: adicionados.length, repassados: repassados.length, semEstoque: semEstoque.length })
              );

              const insItem = db.prepare(`
                INSERT INTO belaped_pedidos_itens (pedido_id, ean, descricao, qtd_pedida, preco_cotado)
                VALUES (?, ?, ?, ?, ?)
              `);
              for (const it of adicionados) {
                insItem.run(pedidoId, it.ean, it.descricao || '', it.quantidade, it.preco_1 || 0);
              }
            } catch (pErr) {
              console.error('[BelaPed] Erro ao salvar pedido DPC no banco:', pErr.message);
            }
          }

          console.log(`[BelaPed Carrinho DPC] Concluído: ${adicionados.length} adicionados, ${repassados.length} repassados p/ 2º colocado.`);
        } catch (botErr) {
          console.error('[BelaPed Carrinho DPC] Erro crítico no robô:', botErr.message);
        } finally {
          if (robot) await robot.fechar().catch(() => {});
          dpcCarrinhoStatus.emAndamento = false;
        }
      })();
    } catch (err) {
      dpcCarrinhoStatus.emAndamento = false;
      console.error('[BelaPed] Erro em montar-carrinho-dpc:', err.message);
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
    itens: [],
    relatorio: null
  };

  /**
   * POST /api/belaped/montar-carrinho-profarma
   * Inicia o robô Puppeteer para adicionar produto a produto no carrinho da Profarma
   */
  router.post('/montar-carrinho-profarma', async (req, res) => {
    try {
      if (profarmaCarrinhoStatus.emAndamento) {
        return res.status(400).json({ success: false, message: 'Uma montagem de carrinho na Profarma já está em andamento.' });
      }

      let itensParaAdicionar = req.body.itens || [];

      // Filtra produtos bloqueados nas regras
      const eansNaoCarrinho = obterEansBloqueadosCarrinho();
      itensParaAdicionar = itensParaAdicionar.filter(it => !eansNaoCarrinho.has(it.ean) && !it.nao_carrinho);

      if (!Array.isArray(itensParaAdicionar) || itensParaAdicionar.length === 0) {
        const produtosGanhadores = db.prepare(`
          SELECT 
            c.ean, 
            COALESCE(cr.ean_substituto, c.ean) AS ean_substituto,
            c.descricao, 
            c.saldo, 
            c.vmd_ponderado, 
            c.preco_unitario_ult_compra,
            c.custo_unitario,
            cr.preco
          FROM compras_estoque_cache c
          JOIN belaped_cotacoes_reais cr ON cr.ean = c.ean AND cr.fornecedor = 'PROFARMA' AND cr.disponivel = 1
          WHERE c.ean IS NOT NULL AND length(c.ean) >= 7
            AND (c.saldo <= 0 OR c.saldo < c.est_minimo_calculado)
            AND c.curva_abc IN ('A', 'B')
            AND c.ean NOT IN (SELECT ean FROM belaped_produtos_regras WHERE nao_carrinho = 1 AND ean IS NOT NULL)
          ORDER BY (c.saldo <= 0) DESC, c.vmd_ponderado DESC
          LIMIT 50
        `).all();

        itensParaAdicionar = produtosGanhadores.map(p => {
          const vmd = Number(p.vmd_ponderado) || 0;
          const saldo = Number(p.saldo) || 0;
          const necessidade7d = Math.ceil(vmd * 7 * 1.15);
          const qtd = saldo <= 0 ? Math.max(1, Math.abs(saldo) + necessidade7d) : Math.max(1, necessidade7d - saldo);
          return {
            ean: p.ean,
            ean_substituto: p.ean_substituto,
            quantidade: qtd,
            descricao: p.descricao,
            preco_1: p.preco,
            preco_ult_compra: Number(p.preco_unitario_ult_compra) || Number(p.custo_unitario) || 0
          };
        });
      }

      if (itensParaAdicionar.length === 0) {
        return res.status(400).json({ success: false, message: 'Nenhum produto vencedor na Profarma para adicionar ao carrinho no momento (ou itens bloqueados).' });
      }

      profarmaCarrinhoStatus.emAndamento = true;
      profarmaCarrinhoStatus.total = itensParaAdicionar.length;
      profarmaCarrinhoStatus.atual = 0;
      profarmaCarrinhoStatus.sucessos = 0;
      profarmaCarrinhoStatus.erros = 0;
      profarmaCarrinhoStatus.ultimoItem = '';
      profarmaCarrinhoStatus.itens = [];
      profarmaCarrinhoStatus.relatorio = null;

      res.json({
        success: true,
        message: `Montagem de carrinho iniciada na Profarma com ${itensParaAdicionar.length} produtos.`,
        status: profarmaCarrinhoStatus
      });

      (async () => {
        let robot = null;
        try {
          console.log('[BelaPed] Iniciando robô Profarma para montagem de carrinho...');
          robot = new ProfarmaRobot({ headless: true });
          await robot.iniciar();

          // 🛡️ REGRA CRÍTICA: Validação e esvaziamento prévio obrigatório
          profarmaCarrinhoStatus.ultimoItem = 'Garantindo carrinho limpo com 0 itens...';
          await garantirCarrinhoVazioRobo(robot, 'profarma');

          for (let i = 0; i < itensParaAdicionar.length; i++) {
            const item = itensParaAdicionar[i];
            profarmaCarrinhoStatus.atual = i + 1;
            profarmaCarrinhoStatus.ultimoItem = `${item.descricao || item.ean} (Qtd: ${item.quantidade})`;

            const eanParaAdicionar = item.ean_substituto || item.ean;
            console.log(`[BelaPed Carrinho Profarma] Adicionando ${eanParaAdicionar} (${item.descricao || ''}) - Qtd ${item.quantidade}...`);
            const resItem = await robot.adicionarAoCarrinho(eanParaAdicionar, item.quantidade, item.descricao);
            const finItem = calcularEconomiaItem(item, item.preco_1, db);

            if (resItem.sucesso) {
              profarmaCarrinhoStatus.sucessos++;
              marcarItemEnviadoCarrinhoSemana(item, 'PROFARMA');
              profarmaCarrinhoStatus.itens.push({
                ean: item.ean,
                ean_substituto: item.ean_substituto || null,
                descricao: item.descricao || '',
                quantidade: item.quantidade,
                preco_1: Number(item.preco_1) || 0,
                subtotal: Number(((Number(item.preco_1) || 0) * item.quantidade).toFixed(2)),
                fornecedor: 'PROFARMA',
                status: 'ADICIONADO',
                preco_ult_compra: finItem.preco_ult_compra,
                subtotal_ult_compra: finItem.subtotal_ult_compra,
                diferenca_reais: finItem.diferenca_reais,
                variacao_pct: finItem.variacao_pct
              });
            } else {
              profarmaCarrinhoStatus.erros++;
              const infoRepasse = resolverRepasseSegundoColocado(item, 'PROFARMA', resItem.motivo);
              profarmaCarrinhoStatus.itens.push({
                ean: item.ean,
                descricao: item.descricao || '',
                quantidade: item.quantidade,
                preco_1: Number(item.preco_1) || 0,
                preco_ult_compra: finItem.preco_ult_compra,
                subtotal_ult_compra: finItem.subtotal_ult_compra,
                diferenca_reais: finItem.diferenca_reais,
                variacao_pct: finItem.variacao_pct,
                ...infoRepasse
              });
            }
          }

          // Monta o Relatório Estruturado Final com Análise Financeira vs Última Compra
          const adicionados = profarmaCarrinhoStatus.itens.filter(i => i.status === 'ADICIONADO');
          const repassados = profarmaCarrinhoStatus.itens.filter(i => i.status === 'REPASSADO_2_COLOCADO');
          const semEstoque = profarmaCarrinhoStatus.itens.filter(i => i.status === 'SEM_ESTOQUE_GERAL');

          profarmaCarrinhoStatus.relatorio = consolidarRelatorioFinanceiro(
            'PROFARMA',
            itensParaAdicionar.length,
            adicionados,
            repassados,
            semEstoque
          );

          if (adicionados.length > 0) {
            try {
              const pedidoId = 'PED-PROFARMA-' + Date.now();
              const totalAdicionadoReais = profarmaCarrinhoStatus.relatorio?.totalAdicionadoReais || 0;
              db.prepare(`
                INSERT INTO belaped_pedidos (id, distribuidora, status, total, qtd_itens, qtd_unidades, observacoes)
                VALUES (?, 'PROFARMA', 'CARRINHO_GERADO', ?, ?, ?, ?)
              `).run(
                pedidoId,
                totalAdicionadoReais,
                adicionados.length,
                adicionados.reduce((acc, c) => acc + c.quantidade, 0),
                JSON.stringify({ sucessos: adicionados.length, repassados: repassados.length, semEstoque: semEstoque.length })
              );

              const insItem = db.prepare(`
                INSERT INTO belaped_pedidos_itens (pedido_id, ean, descricao, qtd_pedida, preco_cotado)
                VALUES (?, ?, ?, ?, ?)
              `);
              for (const it of adicionados) {
                insItem.run(pedidoId, it.ean, it.descricao || '', it.quantidade, it.preco_1 || 0);
              }
            } catch (pErr) {
              console.error('[BelaPed] Erro ao salvar pedido Profarma no banco:', pErr.message);
            }
          }

          console.log(`[BelaPed Carrinho Profarma] Concluído: ${adicionados.length} adicionados, ${repassados.length} repassados p/ 2º colocado.`);
        } catch (botErr) {
          console.error('[BelaPed Carrinho Profarma] Erro crítico no robô:', botErr.message);
        } finally {
          if (robot) await robot.fechar().catch(() => {});
          profarmaCarrinhoStatus.emAndamento = false;
        }
      })();
    } catch (err) {
      profarmaCarrinhoStatus.emAndamento = false;
      console.error('[BelaPed] Erro em montar-carrinho-profarma:', err.message);
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
    itens: [],
    relatorio: null
  };

  /**
   * POST /api/belaped/montar-carrinho-martins
   * Inicia o robô Puppeteer para adicionar produto a produto no carrinho do Martins Atacado
   */
  router.post('/montar-carrinho-martins', async (req, res) => {
    try {
      if (martinsCarrinhoStatus.emAndamento) {
        return res.status(400).json({ success: false, message: 'Uma montagem de carrinho no Martins já está em andamento.' });
      }

      let itensParaAdicionar = req.body.itens || [];

      // Filtra produtos bloqueados nas regras
      const eansNaoCarrinho = obterEansBloqueadosCarrinho();
      itensParaAdicionar = itensParaAdicionar.filter(it => !eansNaoCarrinho.has(it.ean) && !it.nao_carrinho);

      if (!Array.isArray(itensParaAdicionar) || itensParaAdicionar.length === 0) {
        const produtosGanhadores = db.prepare(`
          SELECT 
            c.ean, 
            COALESCE(cr.ean_substituto, c.ean) AS ean_substituto,
            c.descricao, 
            c.saldo, 
            c.vmd_ponderado, 
            c.preco_unitario_ult_compra,
            c.custo_unitario,
            cr.preco
          FROM compras_estoque_cache c
          JOIN belaped_cotacoes_reais cr ON cr.ean = c.ean AND cr.fornecedor = 'MARTINS' AND cr.disponivel = 1
          WHERE c.ean IS NOT NULL AND length(c.ean) >= 7
            AND (c.saldo <= 0 OR c.saldo < c.est_minimo_calculado)
            AND c.curva_abc IN ('A', 'B')
            AND c.ean NOT IN (SELECT ean FROM belaped_produtos_regras WHERE nao_carrinho = 1 AND ean IS NOT NULL)
          ORDER BY (c.saldo <= 0) DESC, c.vmd_ponderado DESC
          LIMIT 50
        `).all();

        itensParaAdicionar = produtosGanhadores.map(p => {
          const vmd = Number(p.vmd_ponderado) || 0;
          const saldo = Number(p.saldo) || 0;
          const necessidade7d = Math.ceil(vmd * 7 * 1.15);
          const qtd = saldo <= 0 ? Math.max(1, Math.abs(saldo) + necessidade7d) : Math.max(1, necessidade7d - saldo);
          return {
            ean: p.ean,
            ean_substituto: p.ean_substituto,
            quantidade: qtd,
            descricao: p.descricao,
            preco_1: p.preco,
            preco_ult_compra: Number(p.preco_unitario_ult_compra) || Number(p.custo_unitario) || 0
          };
        });
      }

      if (itensParaAdicionar.length === 0) {
        return res.status(400).json({ success: false, message: 'Nenhum produto vencedor no Martins para adicionar ao carrinho no momento (ou itens bloqueados).' });
      }

      martinsCarrinhoStatus.emAndamento = true;
      martinsCarrinhoStatus.total = itensParaAdicionar.length;
      martinsCarrinhoStatus.atual = 0;
      martinsCarrinhoStatus.sucessos = 0;
      martinsCarrinhoStatus.erros = 0;
      martinsCarrinhoStatus.ultimoItem = '';
      martinsCarrinhoStatus.itens = [];
      martinsCarrinhoStatus.relatorio = null;

      res.json({
        success: true,
        message: `Montagem de carrinho iniciada no Martins com ${itensParaAdicionar.length} produtos.`,
        status: martinsCarrinhoStatus
      });

      (async () => {
        let robot = null;
        try {
          console.log('[BelaPed] Iniciando robô Martins para montagem de carrinho...');
          robot = new MartinsRobot({ headless: true });
          await robot.iniciar();

          // 🛡️ REGRA CRÍTICA: Validação e esvaziamento prévio obrigatório
          martinsCarrinhoStatus.ultimoItem = 'Garantindo carrinho limpo com 0 itens...';
          await garantirCarrinhoVazioRobo(robot, 'martins');

          for (let i = 0; i < itensParaAdicionar.length; i++) {
            const item = itensParaAdicionar[i];
            martinsCarrinhoStatus.atual = i + 1;
            martinsCarrinhoStatus.ultimoItem = `${item.descricao || item.ean} (Qtd: ${item.quantidade})`;

            const eanParaAdicionar = item.ean_substituto || item.ean;
            console.log(`[BelaPed Carrinho Martins] Adicionando ${eanParaAdicionar} (${item.descricao || ''}) - Qtd ${item.quantidade}...`);
            const resItem = await robot.adicionarAoCarrinho(eanParaAdicionar, item.quantidade, item.descricao);
            const finItem = calcularEconomiaItem(item, item.preco_1, db);

            if (resItem.sucesso) {
              martinsCarrinhoStatus.sucessos++;
              marcarItemEnviadoCarrinhoSemana(item, 'MARTINS ATACADO');
              martinsCarrinhoStatus.itens.push({
                ean: item.ean,
                ean_substituto: item.ean_substituto || null,
                descricao: item.descricao || '',
                quantidade: item.quantidade,
                preco_1: Number(item.preco_1) || 0,
                subtotal: Number(((Number(item.preco_1) || 0) * item.quantidade).toFixed(2)),
                fornecedor: 'MARTINS',
                status: 'ADICIONADO',
                preco_ult_compra: finItem.preco_ult_compra,
                subtotal_ult_compra: finItem.subtotal_ult_compra,
                diferenca_reais: finItem.diferenca_reais,
                variacao_pct: finItem.variacao_pct
              });
            } else {
              martinsCarrinhoStatus.erros++;
              const infoRepasse = resolverRepasseSegundoColocado(item, 'MARTINS', resItem.motivo);
              martinsCarrinhoStatus.itens.push({
                ean: item.ean,
                descricao: item.descricao || '',
                quantidade: item.quantidade,
                preco_1: Number(item.preco_1) || 0,
                preco_ult_compra: finItem.preco_ult_compra,
                subtotal_ult_compra: finItem.subtotal_ult_compra,
                diferenca_reais: finItem.diferenca_reais,
                variacao_pct: finItem.variacao_pct,
                ...infoRepasse
              });
            }
          }

          // Monta o Relatório Estruturado Final com Análise Financeira vs Última Compra
          const adicionados = martinsCarrinhoStatus.itens.filter(i => i.status === 'ADICIONADO');
          const repassados = martinsCarrinhoStatus.itens.filter(i => i.status === 'REPASSADO_2_COLOCADO');
          const semEstoque = martinsCarrinhoStatus.itens.filter(i => i.status === 'SEM_ESTOQUE_GERAL');

          martinsCarrinhoStatus.relatorio = consolidarRelatorioFinanceiro(
            'MARTINS ATACADO',
            itensParaAdicionar.length,
            adicionados,
            repassados,
            semEstoque
          );

          if (adicionados.length > 0) {
            try {
              const pedidoId = 'PED-MARTINS-' + Date.now();
              const totalAdicionadoReais = martinsCarrinhoStatus.relatorio?.totalAdicionadoReais || 0;
              db.prepare(`
                INSERT INTO belaped_pedidos (id, distribuidora, status, total, qtd_itens, qtd_unidades, observacoes)
                VALUES (?, 'MARTINS ATACADO', 'CARRINHO_GERADO', ?, ?, ?, ?)
              `).run(
                pedidoId,
                totalAdicionadoReais,
                adicionados.length,
                adicionados.reduce((acc, c) => acc + c.quantidade, 0),
                JSON.stringify({ sucessos: adicionados.length, repassados: repassados.length, semEstoque: semEstoque.length })
              );

              const insItem = db.prepare(`
                INSERT INTO belaped_pedidos_itens (pedido_id, ean, descricao, qtd_pedida, preco_cotado)
                VALUES (?, ?, ?, ?, ?)
              `);
              for (const it of adicionados) {
                insItem.run(pedidoId, it.ean, it.descricao || '', it.quantidade, it.preco_1 || 0);
              }
            } catch (pErr) {
              console.error('[BelaPed] Erro ao salvar pedido Martins no banco:', pErr.message);
            }
          }

          console.log(`[BelaPed Carrinho Martins] Concluído: ${adicionados.length} adicionados, ${repassados.length} repassados p/ 2º colocado.`);
        } catch (botErr) {
          console.error('[BelaPed Carrinho Martins] Erro crítico no robô:', botErr.message);
        } finally {
          if (robot) await robot.fechar().catch(() => {});
          martinsCarrinhoStatus.emAndamento = false;
        }
      })();
    } catch (err) {
      martinsCarrinhoStatus.emAndamento = false;
      console.error('[BelaPed] Erro em montar-carrinho-martins:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

    router.get('/status-carrinho-martins', (req, res) => {
    res.json({ success: true, status: martinsCarrinhoStatus });
  });

  // Estado de montagem do carrinho na Oriente Farma
  const orienteCarrinhoStatus = {
    emAndamento: false,
    total: 0,
    atual: 0,
    sucessos: 0,
    erros: 0,
    ultimoItem: '',
    itens: [],
    relatorio: null
  };

  /**
   * POST /api/belaped/montar-carrinho-oriente
   * Inicia o robô Puppeteer para adicionar produto a produto no carrinho da Oriente Farma
   */
  router.post('/montar-carrinho-oriente', async (req, res) => {
    try {
      if (orienteCarrinhoStatus.emAndamento) {
        return res.status(400).json({ success: false, message: 'Uma montagem de carrinho na Oriente Farma já está em andamento.' });
      }

      let itensParaAdicionar = req.body.itens || [];

      // Filtra produtos bloqueados nas regras
      const eansNaoCarrinho = obterEansBloqueadosCarrinho();
      itensParaAdicionar = itensParaAdicionar.filter(it => !eansNaoCarrinho.has(it.ean) && !it.nao_carrinho);

      if (!Array.isArray(itensParaAdicionar) || itensParaAdicionar.length === 0) {
        const produtosGanhadores = db.prepare(`
          SELECT 
            c.ean, 
            COALESCE(cr.ean_substituto, c.ean) AS ean_substituto,
            c.descricao, 
            c.saldo, 
            c.vmd_ponderado, 
            c.preco_unitario_ult_compra,
            c.custo_unitario,
            cr.preco
          FROM compras_estoque_cache c
          JOIN belaped_cotacoes_reais cr ON cr.ean = c.ean AND UPPER(cr.fornecedor) LIKE '%ORIENTE%' AND cr.disponivel = 1
          WHERE c.ean IS NOT NULL AND length(c.ean) >= 7
            AND (c.saldo <= 0 OR c.saldo < c.est_minimo_calculado)
            AND c.curva_abc IN ('A', 'B')
            AND c.ean NOT IN (SELECT ean FROM belaped_produtos_regras WHERE nao_carrinho = 1 AND ean IS NOT NULL)
          ORDER BY (c.saldo <= 0) DESC, c.vmd_ponderado DESC
          LIMIT 50
        `).all();

        itensParaAdicionar = produtosGanhadores.map(p => {
          const vmd = Number(p.vmd_ponderado) || 0;
          const saldo = Number(p.saldo) || 0;
          const necessidade7d = Math.ceil(vmd * 7 * 1.15);
          const qtd = saldo <= 0 ? Math.max(1, Math.abs(saldo) + necessidade7d) : Math.max(1, necessidade7d - saldo);
          return {
            ean: p.ean,
            ean_substituto: p.ean_substituto,
            quantidade: qtd,
            descricao: p.descricao,
            preco_1: p.preco,
            preco_ult_compra: Number(p.preco_unitario_ult_compra) || Number(p.custo_unitario) || 0
          };
        });
      }

      if (itensParaAdicionar.length === 0) {
        return res.status(400).json({ success: false, message: 'Nenhum produto vencedor na Oriente Farma para adicionar ao carrinho no momento (ou itens bloqueados).' });
      }

      orienteCarrinhoStatus.emAndamento = true;
      orienteCarrinhoStatus.total = itensParaAdicionar.length;
      orienteCarrinhoStatus.atual = 0;
      orienteCarrinhoStatus.sucessos = 0;
      orienteCarrinhoStatus.erros = 0;
      orienteCarrinhoStatus.ultimoItem = '';
      orienteCarrinhoStatus.itens = [];
      orienteCarrinhoStatus.relatorio = null;

      res.json({
        success: true,
        message: `Montagem de carrinho iniciada na Oriente Farma com ${itensParaAdicionar.length} produtos.`,
        status: orienteCarrinhoStatus
      });

      (async () => {
        let robot = null;
        try {
          console.log('[BelaPed] Iniciando robô Oriente Farma para montagem de carrinho...');
          robot = new OrienteRobot({ headless: true, condicaoComercial: 'GERAL' });
          await robot.iniciar();

          // 🛡️ REGRA CRÍTICA: Validação e esvaziamento prévio obrigatório
          orienteCarrinhoStatus.ultimoItem = 'Garantindo carrinho limpo com 0 itens...';
          await garantirCarrinhoVazioRobo(robot, 'oriente');

          for (let i = 0; i < itensParaAdicionar.length; i++) {
            const item = itensParaAdicionar[i];
            orienteCarrinhoStatus.atual = i + 1;
            orienteCarrinhoStatus.ultimoItem = `${item.descricao || item.ean} (Qtd: ${item.quantidade})`;

            const eanParaAdicionar = item.ean_substituto || item.ean;
            console.log(`[BelaPed Carrinho Oriente] Adicionando ${eanParaAdicionar} (${item.descricao || ''}) - Qtd ${item.quantidade}...`);
            const resItem = await robot.adicionarAoCarrinho(eanParaAdicionar, item.quantidade, item.descricao);
            const finItem = calcularEconomiaItem(item, item.preco_1, db);

            if (resItem.sucesso) {
              orienteCarrinhoStatus.sucessos++;
              marcarItemEnviadoCarrinhoSemana(item, 'ORIENTE FARMA');
              orienteCarrinhoStatus.itens.push({
                ean: item.ean,
                ean_substituto: item.ean_substituto || null,
                descricao: item.descricao || '',
                quantidade: item.quantidade,
                preco_1: Number(item.preco_1) || 0,
                subtotal: Number(((Number(item.preco_1) || 0) * item.quantidade).toFixed(2)),
                fornecedor: 'ORIENTE FARMA',
                status: 'ADICIONADO',
                motivo: 'Adicionado com sucesso ao carrinho Oriente Farma',
                preco_ult_compra: finItem.preco_ult_compra,
                subtotal_ult_compra: finItem.subtotal_ult_compra,
                diferenca_reais: finItem.diferenca_reais,
                variacao_pct: finItem.variacao_pct
              });
            } else {
              orienteCarrinhoStatus.erros++;
              const infoRepasse = resolverRepasseSegundoColocado(item, 'ORIENTE FARMA', resItem.erro);
              orienteCarrinhoStatus.itens.push({
                ean: item.ean,
                descricao: item.descricao || '',
                quantidade: item.quantidade,
                preco_1: Number(item.preco_1) || 0,
                preco_ult_compra: finItem.preco_ult_compra,
                subtotal_ult_compra: finItem.subtotal_ult_compra,
                diferenca_reais: finItem.diferenca_reais,
                variacao_pct: finItem.variacao_pct,
                ...infoRepasse
              });
            }
          }

          // Monta o Relatório Estruturado Final com Análise Financeira vs Última Compra
          const adicionados = orienteCarrinhoStatus.itens.filter(i => i.status === 'ADICIONADO');
          const repassados = orienteCarrinhoStatus.itens.filter(i => i.status === 'REPASSADO_2_COLOCADO');
          const semEstoque = orienteCarrinhoStatus.itens.filter(i => i.status === 'SEM_ESTOQUE_GERAL');

          orienteCarrinhoStatus.relatorio = consolidarRelatorioFinanceiro(
            'ORIENTE FARMA',
            itensParaAdicionar.length,
            adicionados,
            repassados,
            semEstoque
          );

          if (adicionados.length > 0) {
            try {
              const pedidoId = 'PED-ORIENTE-' + Date.now();
              const totalAdicionadoReais = orienteCarrinhoStatus.relatorio?.totalAdicionadoReais || 0;
              db.prepare(`
                INSERT INTO belaped_pedidos (id, distribuidora, status, total, qtd_itens, qtd_unidades, observacoes)
                VALUES (?, 'ORIENTE FARMA', 'CARRINHO_GERADO', ?, ?, ?, ?)
              `).run(
                pedidoId,
                totalAdicionadoReais,
                adicionados.length,
                adicionados.reduce((acc, c) => acc + c.quantidade, 0),
                JSON.stringify({ sucessos: adicionados.length, repassados: repassados.length, semEstoque: semEstoque.length })
              );

              const insItem = db.prepare(`
                INSERT INTO belaped_pedidos_itens (pedido_id, ean, descricao, qtd_pedida, preco_cotado)
                VALUES (?, ?, ?, ?, ?)
              `);
              for (const it of adicionados) {
                insItem.run(pedidoId, it.ean, it.descricao || '', it.quantidade, it.preco_1 || 0);
              }
            } catch (pErr) {
              console.error('[BelaPed] Erro ao salvar pedido Oriente no banco:', pErr.message);
            }
          }

          console.log(`[BelaPed Carrinho Oriente] Concluído: ${adicionados.length} adicionados, ${repassados.length} repassados p/ 2º colocado.`);
        } catch (botErr) {
          console.error('[BelaPed Carrinho Oriente] Erro crítico no robô:', botErr.message);
        } finally {
          if (robot) await robot.fechar().catch(() => {});
          orienteCarrinhoStatus.emAndamento = false;
        }
      })();
    } catch (err) {
      orienteCarrinhoStatus.emAndamento = false;
      console.error('[BelaPed] Erro em montar-carrinho-oriente:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/status-carrinho-oriente', (req, res) => {
    res.json({ success: true, status: orienteCarrinhoStatus });
  });

  // Estado de montagem do carrinho na Panpharma
  const panpharmaCarrinhoStatus = {
    emAndamento: false,
    total: 0,
    atual: 0,
    sucessos: 0,
    erros: 0,
    ultimoItem: '',
    itens: [],
    relatorio: null
  };

  /**
   * POST /api/belaped/montar-carrinho-panpharma
   * Inicia o robô para adicionar os itens no carrinho da Panpharma e gerar lote ePan
   */
  router.post('/montar-carrinho-panpharma', async (req, res) => {
    try {
      if (panpharmaCarrinhoStatus.emAndamento) {
        return res.status(400).json({ success: false, message: 'Uma montagem de carrinho na Panpharma já está em andamento.' });
      }

      let itensParaAdicionar = req.body.itens || [];

      // Filtra produtos bloqueados nas regras
      const eansNaoCarrinho = obterEansBloqueadosCarrinho();
      itensParaAdicionar = itensParaAdicionar.filter(it => !eansNaoCarrinho.has(it.ean) && !it.nao_carrinho);

      if (!Array.isArray(itensParaAdicionar) || itensParaAdicionar.length === 0) {
        const produtosGanhadores = db.prepare(`
          SELECT 
            c.ean, 
            COALESCE(cr.ean_substituto, c.ean) AS ean_substituto,
            c.descricao, 
            c.quantidade_sugerida AS quantidade,
            cr.preco
          FROM compras_estoque_cache c
          INNER JOIN belaped_cotacoes_reais cr ON cr.ean = c.ean
          WHERE UPPER(cr.fornecedor) LIKE '%PANPHARMA%' OR UPPER(cr.fornecedor) LIKE '%PANFARMA%'
        `).all();

        itensParaAdicionar = (produtosGanhadores || []).filter(it => !eansNaoCarrinho.has(it.ean));
      }

      if (itensParaAdicionar.length === 0) {
        return res.status(400).json({ success: false, message: 'Nenhum produto da Panpharma elegível para montagem do carrinho.' });
      }

      panpharmaCarrinhoStatus.emAndamento = true;
      panpharmaCarrinhoStatus.total = itensParaAdicionar.length;
      panpharmaCarrinhoStatus.atual = 0;
      panpharmaCarrinhoStatus.sucessos = 0;
      panpharmaCarrinhoStatus.erros = 0;
      panpharmaCarrinhoStatus.ultimoItem = '';
      panpharmaCarrinhoStatus.itens = [];
      panpharmaCarrinhoStatus.relatorio = null;

      res.json({
        success: true,
        message: `Montagem de carrinho iniciada na Panpharma com ${itensParaAdicionar.length} produtos.`,
        status: panpharmaCarrinhoStatus
      });

      (async () => {
        let robot = null;
        try {
          console.log('[BelaPed] Iniciando robô Panpharma para montagem de carrinho...');
          robot = new PanpharmaRobot();
          await robot.iniciar();

          // 🛡️ REGRA CRÍTICA: Validação e esvaziamento prévio obrigatório
          panpharmaCarrinhoStatus.ultimoItem = 'Garantindo carrinho limpo com 0 itens...';
          await garantirCarrinhoVazioRobo(robot, 'panpharma');

          for (let i = 0; i < itensParaAdicionar.length; i++) {
            const item = itensParaAdicionar[i];
            panpharmaCarrinhoStatus.atual = i + 1;
            panpharmaCarrinhoStatus.ultimoItem = `${item.descricao || item.ean} (Qtd: ${item.quantidade})`;

            const eanParaUsar = item.ean_substituto || item.ean;
            const resItem = await robot.adicionarAoCarrinho(eanParaUsar, item.quantidade, item.descricao);

            if (resItem.sucesso) {
              panpharmaCarrinhoStatus.sucessos++;
              panpharmaCarrinhoStatus.itens.push({
                ean: item.ean,
                descricao: item.descricao,
                quantidade: item.quantidade,
                status: 'SUCESSO',
                motivo: resItem.motivo || 'Adicionado com sucesso'
              });
            } else {
              panpharmaCarrinhoStatus.erros++;
              panpharmaCarrinhoStatus.itens.push({
                ean: item.ean,
                descricao: item.descricao,
                quantidade: item.quantidade,
                status: 'FALHA',
                motivo: resItem.motivo || 'Erro ao adicionar'
              });
            }
          }

          panpharmaCarrinhoStatus.relatorio = {
            finalizadoEm: new Date().toISOString(),
            totalProcessados: itensParaAdicionar.length,
            sucessos: panpharmaCarrinhoStatus.sucessos,
            erros: panpharmaCarrinhoStatus.erros
          };
        } catch (botErr) {
          console.error('[BelaPed] Erro durante a montagem na Panpharma:', botErr.message);
          panpharmaCarrinhoStatus.erros++;
        } finally {
          panpharmaCarrinhoStatus.emAndamento = false;
          if (robot) await robot.fechar().catch(() => {});
        }
      })();
    } catch (err) {
      panpharmaCarrinhoStatus.emAndamento = false;
      console.error('[BelaPed] Erro em montar-carrinho-panpharma:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/status-carrinho-panpharma', (req, res) => {
    res.json({ success: true, status: panpharmaCarrinhoStatus });
  });

  /**
   * GET /api/belaped/oriente/pedidos-recentes
   * Consulta os pedidos gerados recentemente no portal da Oriente Farma (gerenciar-pedidos)
   */
  router.get('/oriente/pedidos-recentes', async (req, res) => {
    const rob = new OrienteRobot({ headless: true });
    try {
      await rob.iniciar();
      const limite = parseInt(String(req.query.limite || '15'), 10) || 15;
      const pedidos = await rob.consultarPedidosGerenciador(limite);
      res.json({ success: true, pedidos });
    } catch (err) {
      console.error('[BelaPed] Erro ao buscar pedidos recentes na Oriente:', err.message);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      try { await rob.fechar(); } catch (e) {}
    }
  });

  /**
   * POST /api/belaped/oriente/importar-pedido
   * Importa automaticamente um pedido finalizado na Oriente Farma (gerenciar-pedidos/:id)
   * Cadastra os itens, boletos, prazos e controle orçamentário no Belinha
   */
  router.post('/oriente/importar-pedido', async (req, res) => {
    const { codigoPedido } = req.body || {};
    if (!codigoPedido) {
      return res.status(400).json({ success: false, error: 'codigoPedido é obrigatório.' });
    }

    const rob = new OrienteRobot({ headless: true });
    try {
      await rob.iniciar();
      const detalhes = await rob.consultarDetalhesPedido(codigoPedido);
      
      // Formata itens com status de faturamento/corte
      const itensFormatados = (detalhes.itens || []).map(it => {
        const p = it.produto || {};
        const qtdSol = Number(it.quantidadeOriginal || it.quantidade || 0);
        const qtdAtend = it.quantidadeAtendida !== undefined ? Number(it.quantidadeAtendida) : qtdSol;
        const qtdCorte = it.quantidadeCorte !== undefined ? Number(it.quantidadeCorte) : (qtdSol - qtdAtend);
        const isCorte = qtdAtend === 0 && qtdSol > 0;

        return {
          codigo: p.codigoProduto || it.codigoProduto,
          ean: p.codigoBarras || '',
          descricao: p.descricao || '',
          quantidade: qtdSol,
          quantidadeSolicitada: qtdSol,
          quantidadeAtendida: qtdAtend,
          quantidadeCorte: qtdCorte,
          precoUnitario: Number(it.precoUnitario || 0),
          valorST: Number(it.valorST || 0),
          desconto: Number(it.percentualDesconto || 0),
          subtotal: Number(it.valorTotal || 0),
          status: isCorte ? 'Corte' : 'Atendido'
        };
      });

      // Calcula total efetivo após cortes (se houver itens cortados)
      const cortesValor = (detalhes.itens || [])
        .filter(it => it.quantidadeAtendida === 0 && (it.quantidadeOriginal || it.quantidade) > 0)
        .reduce((sum, it) => sum + Number(it.valorTotal || 0), 0);

      const totalEfetivo = Number((Number(detalhes.valorTotal || detalhes.valorNota || 0) - (cortesValor > 0 && detalhes.status === 'Pendente' ? cortesValor : 0)).toFixed(2));

      // Lança no Belinha (orders + boletos + monthly_limits + belaped_pedidos)
      const lancamento = lancarPedidoNaGuiaBelinha({
        distribuidora: 'ORIENTE FARMA',
        valorTotal: totalEfetivo,
        prazoEscolhido: detalhes.prazoPagamentoDescricao || '28 DDL',
        itens: itensFormatados,
        numeroPedido: String(detalhes.codigoPedido)
      });

      res.json({
        success: true,
        mensagem: `Pedido #${codigoPedido} importado com sucesso da Oriente Farma!`,
        detalhes: {
          codigoPedido: detalhes.codigoPedido,
          codigoPedidoERP: detalhes.codigoPedidoERP,
          statusPortal: detalhes.status,
          totalEfetivo,
          prazo: detalhes.prazoPagamentoDescricao,
          qtdItens: itensFormatados.length
        },
        lancamento
      });

    } catch (err) {
      console.error(`[BelaPed] Erro ao importar pedido #${codigoPedido} da Oriente:`, err.message);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      try { await rob.fechar(); } catch (e) {}
    }
  });

  /**
   * POST /api/belaped/limpar-carrinhos
   * Aciona a limpeza explícita e confirmação de 0 itens para os portais informados (ou todos os 7)
   */
  router.post('/limpar-carrinhos', async (req, res) => {
    const portais = req.body.portais || ['soton', 'divimed', 'distrimed', 'profarma', 'dpc', 'martins', 'oriente'];
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

  /**
   * Fábrica universal de robôs BelaPed
   */
  function obterInstanciaRobo(portalNome, options = { headless: true }) {
    const p = String(portalNome || '').toUpperCase();
    if (p.includes('PROFARMA')) return new ProfarmaRobot(options);
    if (p.includes('SOTON')) return new SotonRobot(options);
    if (p.includes('DPC')) return new DpcRobot(options);
    if (p.includes('MARTINS')) return new MartinsRobot(options);
    if (p.includes('DISTRIMED')) return new DistrimedRobot(options);
    if (p.includes('DIVIMED')) return new DivimedRobot(options);
    if (p.includes('ORIENTE')) return new OrienteRobot(options);
    if (p.includes('PANPHARMA') || p.includes('PANFARMA')) return new PanpharmaRobot(options);
    return null;
  }

  // Estado global do orquestrador de todos os carrinhos
  const todosCarrinhosStatus = {
    emAndamento: false,
    totalDistribuidoras: 0,
    distribuidoraAtualIndex: 0,
    distribuidoraAtualNome: '',
    totalItensDistribuidora: 0,
    itemAtualIndex: 0,
    ultimoItem: '',
    itensSucessoTotal: 0,
    itensErroTotal: 0,
    carrinhosProcessados: [],
    iniciadoEm: null,
    finalizadoEm: null,
    erroGeral: null
  };

  /**
   * POST /api/belaped/montar-todos-carrinhos
   * Orquestrador sequencial que monta os carrinhos robô a robô
   */
  router.post('/montar-todos-carrinhos', async (req, res) => {
    try {
      if (todosCarrinhosStatus.emAndamento) {
        return res.status(400).json({
          success: false,
          message: 'Uma montagem de todos os carrinhos já está em andamento. Aguarde a conclusão.',
          status: todosCarrinhosStatus
        });
      }

      const { carrinhos = [] } = req.body;
      const carrinhosValidos = carrinhos.filter(c => Array.isArray(c.itens) && c.itens.length > 0);

      if (carrinhosValidos.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Nenhum carrinho com itens informado para montagem.'
        });
      }

      todosCarrinhosStatus.emAndamento = true;
      todosCarrinhosStatus.totalDistribuidoras = carrinhosValidos.length;
      todosCarrinhosStatus.distribuidoraAtualIndex = 0;
      todosCarrinhosStatus.distribuidoraAtualNome = '';
      todosCarrinhosStatus.totalItensDistribuidora = 0;
      todosCarrinhosStatus.itemAtualIndex = 0;
      todosCarrinhosStatus.ultimoItem = 'Iniciando fila sequencial de carrinhos...';
      todosCarrinhosStatus.itensSucessoTotal = 0;
      todosCarrinhosStatus.itensErroTotal = 0;
      todosCarrinhosStatus.carrinhosProcessados = [];
      todosCarrinhosStatus.iniciadoEm = new Date().toISOString();
      todosCarrinhosStatus.finalizadoEm = null;
      todosCarrinhosStatus.erroGeral = null;

      res.json({
        success: true,
        message: `Fila sequencial iniciada com ${carrinhosValidos.length} distribuidora(s).`,
        status: todosCarrinhosStatus
      });

      // Executa em background sequencialmente para não sobrecarregar memória/portais
      (async () => {
        try {
          for (let cIdx = 0; cIdx < carrinhosValidos.length; cIdx++) {
            const carrinho = carrinhosValidos[cIdx];
            const distNome = carrinho.distribuidora;
            todosCarrinhosStatus.distribuidoraAtualIndex = cIdx + 1;
            todosCarrinhosStatus.distribuidoraAtualNome = distNome;
            todosCarrinhosStatus.totalItensDistribuidora = carrinho.itens.length;
            todosCarrinhosStatus.itemAtualIndex = 0;
            todosCarrinhosStatus.ultimoItem = `Iniciando robô da ${distNome}...`;

            console.log(`[BelaPed Fila] [${cIdx + 1}/${carrinhosValidos.length}] Montando carrinho da ${distNome} (${carrinho.itens.length} itens)...`);

            const robot = obterInstanciaRobo(distNome);
            if (!robot) {
              console.warn(`[BelaPed Fila] Robô não disponível para distribuidora: ${distNome}`);
              todosCarrinhosStatus.itensErroTotal += carrinho.itens.length;
              continue;
            }

            let itensSucesso = 0;
            let itensErro = 0;
            try {
              await robot.iniciar();

              // Se a distribuidora for Distrimed e aceitar importação via arquivo:
              if (distNome.toUpperCase().includes('DISTRIMED') && typeof robot.importarCarrinhoArquivo === 'function') {
                todosCarrinhosStatus.ultimoItem = `Garantindo carrinho limpo com 0 itens na Distrimed...`;
                await garantirCarrinhoVazioRobo(robot, 'distrimed').catch(() => {});
                
                const linhasTxt = carrinho.itens.map(it => `${it.ean_substituto || it.ean || it.produto_id};${it.quantidade}`).join('\r\n');
                const tempPath = path.join(__dirname, `temp_carrinho_distrimed_${Date.now()}.txt`);
                fs.writeFileSync(tempPath, linhasTxt, 'utf-8');
                
                todosCarrinhosStatus.ultimoItem = `Importando ${carrinho.itens.length} itens na modal da Distrimed...`;
                const resImport = await robot.importarCarrinhoArquivo(tempPath);
                try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (e) {}
                
                if (resImport.sucesso) {
                  itensSucesso = carrinho.itens.length;
                  todosCarrinhosStatus.itensSucessoTotal += itensSucesso;
                } else {
                  itensErro = carrinho.itens.length;
                  todosCarrinhosStatus.itensErroTotal += itensErro;
                }
              } else {
                // Montagem padrão item por item
                const portalClean = distNome.toLowerCase().replace(/[^a-z]/g, '');
                todosCarrinhosStatus.ultimoItem = `Garantindo carrinho limpo com 0 itens na ${distNome}...`;
                await garantirCarrinhoVazioRobo(robot, portalClean).catch(() => {});

                for (let itIdx = 0; itIdx < carrinho.itens.length; itIdx++) {
                  const it = carrinho.itens[itIdx];
                  todosCarrinhosStatus.itemAtualIndex = itIdx + 1;
                  todosCarrinhosStatus.ultimoItem = `${distNome}: ${it.descricao || it.ean} (Qtd: ${it.quantidade})`;

                  const eanAdicionar = it.ean_substituto || it.ean;
                  const resAdd = await robot.adicionarAoCarrinho(eanAdicionar, it.quantidade, it.descricao);
                  if (resAdd && resAdd.sucesso) {
                    itensSucesso++;
                    todosCarrinhosStatus.itensSucessoTotal++;
                  } else {
                    itensErro++;
                    todosCarrinhosStatus.itensErroTotal++;
                  }
                  await new Promise(r => setTimeout(r, 600));
                }
              }

              todosCarrinhosStatus.carrinhosProcessados.push({
                distribuidora: distNome,
                sucesso: itensSucesso > 0,
                itensSucesso,
                itensErro,
                totalItens: carrinho.itens.length
              });
            } catch (distErr) {
              console.error(`[BelaPed Fila] Erro ao montar ${distNome}:`, distErr.message);
              todosCarrinhosStatus.itensErroTotal += (carrinho.itens.length - itensSucesso);
              todosCarrinhosStatus.carrinhosProcessados.push({
                distribuidora: distNome,
                sucesso: false,
                erro: distErr.message
              });
            } finally {
              if (robot) await robot.fechar().catch(() => {});
            }
          }
          console.log(`[BelaPed Fila] ✅ Montagem sequencial de todos os carrinhos finalizada!`);
        } catch (errGlobal) {
          console.error('[BelaPed Fila] Erro crítico no orquestrador:', errGlobal.message);
          todosCarrinhosStatus.erroGeral = errGlobal.message;
        } finally {
          todosCarrinhosStatus.emAndamento = false;
          todosCarrinhosStatus.finalizadoEm = new Date().toISOString();
          todosCarrinhosStatus.ultimoItem = 'Todos os carrinhos foram processados.';
        }
      })();
    } catch (err) {
      todosCarrinhosStatus.emAndamento = false;
      console.error('[BelaPed] Erro em montar-todos-carrinhos:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get('/status-todos-carrinhos', (req, res) => {
    res.json({ success: true, status: todosCarrinhosStatus });
  });

  /**
   * Helper: Lança automaticamente a compra realizada no BelaPed na guia "Pedidos" (orders + boletos) do Belinha
   * com previsão de chegada de +2 dias úteis e parcelas/boletos calculados.
   */
  function lancarPedidoNaGuiaBelinha({ distribuidora, valorTotal, prazoEscolhido, parcelasCustomizadas, itens = [], numeroPedido = '' }) {
    const total = Number((Number(valorTotal) || 0).toFixed(2));
    if (!distribuidora || total <= 0) return null;

    const hoje = new Date();
    const orderDate = hoje.toISOString().slice(0, 10);

    // Previsão de entrega: +2 dias úteis
    const previsao = new Date(hoje);
    let diasUteisSomados = 0;
    while (diasUteisSomados < 2) {
      previsao.setDate(previsao.getDate() + 1);
      const dow = previsao.getDay();
      if (dow !== 0 && dow !== 6) diasUteisSomados++;
    }
    const arrivalForecast = previsao.toISOString().slice(0, 10);

    // Calcula as parcelas (installments)
    let installments = [];
    const isDistrimedCustom = String(distribuidora).toUpperCase().includes('DISTRIMED') &&
      (String(prazoEscolhido || '').toUpperCase().includes('ESCOLHER') || (Array.isArray(parcelasCustomizadas) && parcelasCustomizadas.length > 0));

    if (isDistrimedCustom) {
      const listaParc = (Array.isArray(parcelasCustomizadas) && parcelasCustomizadas.length > 0)
        ? parcelasCustomizadas
        : calcularParcelasDistrimedMenorDespesa(total).parcelas;

      installments = listaParc.map((p, idx) => ({
        id: String(idx + 1),
        value: Number(p.valor || p.value || 0),
        dueDate: String(p.dueDate || orderDate).slice(0, 10)
      }));
    } else {
      const prazoStr = String(prazoEscolhido || '28 DDL').trim();
      const matchesDias = prazoStr.match(/\d+/g);
      const diasArray = (matchesDias && matchesDias.length > 0)
        ? matchesDias.map(Number).filter(n => n > 0 && n <= 365)
        : [28];
      if (diasArray.length === 0) diasArray.push(28);

      const valorBase = Math.floor((total / diasArray.length) * 100) / 100;
      installments = diasArray.map((dias, idx) => {
        const dtVenc = new Date(hoje.getTime() + dias * 86400000);
        const isUltima = idx === diasArray.length - 1;
        const valParc = isUltima
          ? Number((total - valorBase * (diasArray.length - 1)).toFixed(2))
          : Number(valorBase.toFixed(2));
        return {
          id: String(idx + 1),
          value: valParc,
          dueDate: dtVenc.toISOString().slice(0, 10)
        };
      });
    }

    const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const primeiraData = installments[0]?.dueDate ? new Date(installments[0].dueDate + 'T12:00:00') : hoje;
    const paymentMonth = nomesMeses[primeiraData.getMonth()] || 'Novembro';

    const orderId = `belaped_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const resumoItens = Array.isArray(itens) && itens.length > 0
      ? itens.slice(0, 8).map(i => `${i.quantidade || 1}x ${i.descricao}`).join(', ') + (itens.length > 8 ? ` (+${itens.length - 8} itens)` : '')
      : '';
    const notes = `Compra via BelaPed (${itens.length || 0} produtos) • Prazo: ${prazoEscolhido || '28 DDL'}${numeroPedido ? ` • Pedido Portal: #${numeroPedido}` : ''}${resumoItens ? ` • Itens: ${resumoItens}` : ''}`;

    db.transaction(() => {
      db.prepare(`
        INSERT INTO orders (id, orderDate, distributor, seller, totalValue, arrivalForecast, status, paymentMonth, invoiceNumber, paymentMethod, receiptDate, notes, installments, items, isFogueteAmarelo, boletoPath)
        VALUES (@id, @orderDate, @distributor, @seller, @totalValue, @arrivalForecast, @status, @paymentMonth, @invoiceNumber, @paymentMethod, @receiptDate, @notes, @installments, @items, @isFogueteAmarelo, @boletoPath)
      `).run({
        id: orderId,
        orderDate,
        distributor: distribuidora,
        seller: 'BelaPed Automático',
        totalValue: total,
        arrivalForecast,
        status: 'Pendente',
        paymentMonth,
        invoiceNumber: numeroPedido || '',
        paymentMethod: 'Boleto',
        receiptDate: null,
        notes,
        installments: JSON.stringify(installments),
        items: JSON.stringify(itens || []),
        isFogueteAmarelo: 0,
        boletoPath: null
      });

      // Também registra em belaped_pedidos e belaped_pedidos_itens para rastreamento completo
      try {
        const stmtBelapedPed = db.prepare(`
          INSERT INTO belaped_pedidos (id, distribuidora, status, total, qtd_itens, qtd_unidades, prazo_previsto, nf, observacoes, criado_por, created_at, updated_at, numero_pedido_portal, prazo_escolhido)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?, ?)
        `);
        const totalUnidades = (itens || []).reduce((acc, it) => acc + (Number(it.quantidade || it.qtd_pedida || 1) || 1), 0);
        stmtBelapedPed.run(orderId, distribuidora, 'FINALIZADO_PELO_USUARIO', total, (itens || []).length, totalUnidades, arrivalForecast, numeroPedido || null, notes, 'BelaPed', numeroPedido || null, prazoEscolhido || null);

        const stmtItem = db.prepare(`
          INSERT INTO belaped_pedidos_itens (pedido_id, ean, descricao, qtd_pedida, preco_cotado, qtd_faturada, preco_cobrado)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const it of (itens || [])) {
          const qtd = Number(it.quantidade || it.qtd_pedida || 1) || 1;
          const qtdAtend = it.quantidadeAtendida !== undefined ? Number(it.quantidadeAtendida) : qtd;
          const pr = Number(it.precoUnitario || it.preco_cotado || 0);
          stmtItem.run(orderId, it.ean || it.codigoBarras || null, it.descricao || '', qtd, pr, qtdAtend, pr);
        }
      } catch (eBelaPed) {
        console.warn('[BelaPed] Aviso ao salvar em belaped_pedidos:', eBelaPed.message);
      }

      const insertBoleto = db.prepare(`
        INSERT INTO boletos (id, supplierName, order_id, due_date, value, status, invoice_number)
        VALUES (@id, @supplierName, @order_id, @due_date, @value, @status, @invoice_number)
      `);

      installments.forEach((inst, index) => {
        insertBoleto.run({
          id: `${orderId}-boleto-${index + 1}`,
          supplierName: distribuidora,
          order_id: orderId,
          due_date: inst.dueDate,
          value: Number(inst.value),
          status: 'Pendente',
          invoice_number: numeroPedido || null
        });
      });

      // Remove automaticamente da lista de Produtos Desejados (belaped_itens_avulsos) os itens cuja compra foi confirmada
      if (Array.isArray(itens) && itens.length > 0) {
        const delByEan = db.prepare('DELETE FROM belaped_itens_avulsos WHERE TRIM(ean) = ?');
        const delByProdId = db.prepare('DELETE FROM belaped_itens_avulsos WHERE produto_id = ?');
        const delByDesc = db.prepare('DELETE FROM belaped_itens_avulsos WHERE UPPER(TRIM(descricao)) = ?');
        for (const it of itens) {
          const eanIt = String(it.ean || '').trim();
          const pidIt = Number(it.produto_id) || 0;
          const descIt = String(it.descricao || '').toUpperCase().trim();
          if (eanIt && eanIt.length >= 7) delByEan.run(eanIt);
          if (pidIt > 0) delByProdId.run(pidIt);
          if (descIt) delByDesc.run(descIt);
        }
      }
    })();

    console.log(`[BelaPed -> Guia Pedidos] ✅ Pedido ${orderId} (${distribuidora} - R$ ${total.toFixed(2)}) e ${installments.length} boleto(s) lançados na guia Pedidos do Belinha!`);
    return { orderId, installments, arrivalForecast, paymentMonth };
  }

  /**
   * POST /api/belaped/lancar-pedido-belinha
   * Permite lançar/confirmar uma compra diretamente na guia "Pedidos" do Belinha (orders + boletos)
   */
  router.post('/lancar-pedido-belinha', (req, res) => {
    try {
      const { distribuidora, valorTotal, prazoEscolhido, parcelasCustomizadas, itens, numeroPedido } = req.body || {};
      if (!distribuidora || !valorTotal) {
        return res.status(400).json({ success: false, error: 'Distribuidora e valorTotal são obrigatórios.' });
      }
      const lancamento = lancarPedidoNaGuiaBelinha({
        distribuidora,
        valorTotal,
        prazoEscolhido,
        parcelasCustomizadas,
        itens: itens || [],
        numeroPedido: numeroPedido || ''
      });
      res.json({ success: true, lancamento });
    } catch (err) {
      console.error('[BelaPed] Erro ao lançar pedido na guia do Belinha:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/belaped/buscar-estoque-real?q=...
   * Pesquisa TODOS os produtos que contenham a palavra-chave no estoque real completo da farmácia (compras_estoque_cache),
   * ordenando pelo histórico completo de vendas (10m / 90d / 30d), exibindo o desempenho detalhado e permitindo gravar nos Produtos Desejados.
   */
  router.get('/buscar-estoque-real', (req, res) => {
    try {
      const q = String(req.query.q || '').trim();
      if (q.length < 2) {
        return res.json({ success: true, produtos: [], resultados: [], resumo_pesquisa: null });
      }

      // Suporta busca por uma ou múltiplas palavras-chave (ex: "maxton", "maxton 7.0", "dipirona 1g")
      const palavras = q.split(/\s+/).filter(Boolean);
      const condicoesLike = palavras.map(() => '(descricao LIKE ? OR apresentacao LIKE ?)').join(' AND ');
      const paramsLike = [];
      for (const p of palavras) {
        paramsLike.push(`%${p}%`, `%${p}%`);
      }

      let rows = db.prepare(`
        SELECT 
          produto_id, descricao, apresentacao, ean, curva_abc, saldo,
          est_minimo_calculado, vmd_ponderado, vendas_30d, vendas_31_60d,
          COALESCE(vendas_61_90d, 0) as vendas_61_90d,
          COALESCE(vendas_10m, 0) as vendas_10m,
          COALESCE(entradas_10m, 0) as entradas_10m,
          custo_unitario, preco_unitario_ult_compra, preco_venda_vigente,
          ultima_compra_fornecedor, ultima_compra_data, categoria_id
        FROM compras_estoque_cache
        WHERE (${condicoesLike}) OR ean LIKE ? OR CAST(produto_id AS TEXT) = ?
        ORDER BY 
          CASE WHEN ean = ? THEN 0 ELSE 1 END ASC,
          COALESCE(vendas_10m, 0) DESC,
          (COALESCE(vendas_30d, 0) + COALESCE(vendas_31_60d, 0) + COALESCE(vendas_61_90d, 0)) DESC,
          vmd_ponderado DESC,
          saldo DESC,
          descricao ASC
        LIMIT 1000
      `).all(...paramsLike, `%${q}%`, q, q);

      // Fallback para digifarma_cache caso não esteja no compras_estoque_cache
      if (rows.length === 0) {
        try {
          const condicoesDf = palavras.map(() => '(descricao LIKE ? OR apresentacao LIKE ?)').join(' AND ');
          const rowsDf = db.prepare(`
            SELECT 
              produto_id, descricao, apresentacao, ean, 'C' as curva_abc, saldo,
              1 as est_minimo_calculado, 0 as vmd_ponderado, 0 as vendas_30d, 0 as vendas_31_60d,
              0 as vendas_61_90d, 0 as vendas_10m, 0 as entradas_10m,
              custo as custo_unitario, custo as preco_unitario_ult_compra, preco_venda as preco_venda_vigente,
              null as ultima_compra_fornecedor, null as ultima_compra_data, 1 as categoria_id
            FROM digifarma_cache
            WHERE (${condicoesDf}) OR ean LIKE ? OR CAST(produto_id AS TEXT) = ?
            ORDER BY saldo DESC, descricao ASC
            LIMIT 500
          `).all(...paramsLike, `%${q}%`, q);
          if (rowsDf.length > 0) rows = rowsDf;
        } catch (eDf) {}
      }

      // Carrega Produtos Desejados (belaped_itens_avulsos) e regras
      const avulsosMap = {};
      try {
        db.prepare('SELECT * FROM belaped_itens_avulsos').all().forEach(a => {
          if (a.ean) avulsosMap[String(a.ean).trim()] = a;
          if (a.produto_id) avulsosMap[`ID_${a.produto_id}`] = a;
          if (a.descricao) avulsosMap[String(a.descricao).toUpperCase().trim()] = a;
        });
      } catch (e) {}

      // Carrega cotações reais para mostrar preços já cotados nos portais
      const cotacoesPorEan = {};
      try {
        const cots = db.prepare(`
          SELECT ean, fornecedor, preco, disponivel, updated_at
          FROM belaped_cotacoes_reais
          WHERE disponivel = 1 AND preco > 0
          ORDER BY preco ASC
        `).all();
        for (const c of cots) {
          const e = String(c.ean || '').trim();
          if (!e) continue;
          if (!cotacoesPorEan[e]) cotacoesPorEan[e] = [];
          cotacoesPorEan[e].push(c);
        }
      } catch (eCot) {}

      const regrasMap = {};
      try {
        db.prepare('SELECT * FROM belaped_produtos_regras').all().forEach(r => {
          if (r.ean) regrasMap[String(r.ean).trim()] = r;
          if (r.produto_id) regrasMap[`ID_${r.produto_id}`] = r;
        });
      } catch (e) {}

      let comVendasHistorico = 0;
      let comEstoque = 0;
      let zeradosComGiro = 0;
      let semGiroZerados = 0;
      let somaVendas30d = 0;
      let somaVendas90d = 0;
      let somaVendas10m = 0;
      let somaEstoqueAtual = 0;

      const produtosAnalisados = rows.map(r => {
        const saldo = Math.max(0, Number(r.saldo) || 0);
        const vmd = Number(r.vmd_ponderado) || 0;
        const vendas30d = Number(r.vendas_30d) || 0;
        const vendas60d = Number(r.vendas_31_60d) || 0;
        const vendas90dIsolado = Number(r.vendas_61_90d) || 0;
        const vendas90dTotal = vendas30d + vendas60d + vendas90dIsolado;
        const vendas10m = Math.max(Number(r.vendas_10m) || 0, vendas90dTotal);
        const entradas10m = Number(r.entradas_10m) || 0;
        const vendas6m = vendas60d + vendas90dIsolado + Math.max(0, vendas10m - vendas30d);
        const diasCobertura = vmd > 0 ? Math.round(saldo / vmd) : (saldo > 0 ? 999 : 0);
        const metaUnidades7d = Math.max(1, Math.ceil(vmd * 7));
        const eanTrim = String(r.ean || '').trim();
        const reg = (eanTrim && regrasMap[eanTrim]) || regrasMap[`ID_${r.produto_id}`] || null;
        const regDesejado = (eanTrim && avulsosMap[eanTrim]) || avulsosMap[`ID_${r.produto_id}`] || avulsosMap[String(r.descricao || '').toUpperCase().trim()] || null;
        const isAvulso = Boolean(regDesejado);

        if (vendas10m > 0 || vendas90dTotal > 0) comVendasHistorico++;
        if (saldo > 0) comEstoque++;
        if (saldo <= 0 && (vendas10m > 0 || vendas90dTotal > 0)) zeradosComGiro++;
        if (saldo <= 0 && vendas10m === 0 && vendas90dTotal === 0) semGiroZerados++;

        somaVendas30d += vendas30d;
        somaVendas90d += vendas90dTotal;
        somaVendas10m += vendas10m;
        somaEstoqueAtual += saldo;

        // Verifica se existe equivalente da mesma molécula/dosagem com estoque na loja (apenas para medicamentos)
        let equivComSaldo = null;
        if (saldo <= 0 && r.categoria_id !== 5 && r.categoria_id !== 7 && comprasEquivalentesService && typeof comprasEquivalentesService.extrairAtributosProduto === 'function') {
          try {
            const attr = comprasEquivalentesService.extrairAtributosProduto(r.descricao || '');
            if (attr && attr.dosagem && attr.principio && attr.principio !== 'OUTROS' && attr.principio.length >= 4) {
              const prefixo = attr.principio.split(' ')[0];
              const cands = db.prepare(`
                SELECT produto_id, descricao, saldo FROM compras_estoque_cache
                WHERE produto_id <> ? AND saldo > 0 AND descricao LIKE ?
              `).all(Number(r.produto_id), `%${prefixo}%`);
              equivComSaldo = cands.find(c => {
                const a2 = comprasEquivalentesService.extrairAtributosProduto(c.descricao || '');
                return a2 && a2.chave === attr.chave;
              }) || null;
            }
          } catch (eEq) {}
        }

        const isCurvaAB = r.curva_abc === 'A' || r.curva_abc === 'B';
        const isEsquecido6m = saldo <= 0 && vendas30d === 0 && vendas6m >= 1;
        const isCurvaCRupturaAtiva = r.curva_abc === 'C' && saldo <= 0 && (vendas30d >= 1 || isEsquecido6m);
        const precisaComprarPelaRegra = !equivComSaldo &&
          (isCurvaAB || isCurvaCRupturaAtiva || isEsquecido6m) &&
          (saldo <= 0 || diasCobertura <= 7 || saldo < metaUnidades7d) &&
          !(reg && reg.nao_cotar);

        const jaNaCotacao = Boolean(precisaComprarPelaRegra || isAvulso);
        const labelUnidades = saldo === 1 ? '1 unidade' : `${saldo} unidades`;

        // Constrói a justificativa direta e amigável de por que está ou não está indicado para compra nesta semana
        let justificativaNaoComprar = '';
        if (isAvulso) {
          justificativaNaoComprar = `⭐ Produto gravado na sua lista de Produtos Desejados (${regDesejado.qtd_sugerida || 1} un) — já está na fila de cotação dos robôs! (Estoque atual: ${labelUnidades} • Vendas 10m: ${vendas10m} un)`;
        } else if (jaNaCotacao) {
          justificativaNaoComprar = saldo <= 0
            ? `Em ruptura (0 unidades em estoque) com histórico de ${vendas10m} un vendidas nos últimos 10 meses (${vendas30d} un em 30d • Curva ${r.curva_abc}) — já está indicado na cotação!`
            : `Cobertura baixa: consta com ${labelUnidades} em estoque (dura apenas ${diasCobertura} dias para meta semanal de ${metaUnidades7d} un • Vendas 10m: ${vendas10m} un) — já está indicado na cotação!`;
        } else if (reg && reg.nao_cotar) {
          justificativaNaoComprar = `Esse produto consta com ${labelUnidades} em estoque, mas está bloqueado manualmente pela regra "Não Cotar"${reg.motivo_justificativa ? `: ${reg.motivo_justificativa}` : ''}.`;
        } else if (equivComSaldo) {
          justificativaNaoComprar = `Esse produto consta com 0 unidades em estoque, porém a loja já possui equivalente da mesma molécula/dosagem em estoque (${equivComSaldo.descricao} com ${equivComSaldo.saldo} un) — saldo suficiente para essa semana.`;
        } else if (saldo > 0 && (diasCobertura > 7 || saldo >= metaUnidades7d) && (vmd > 0 || vendas30d > 0 || vendas10m > 0)) {
          justificativaNaoComprar = `Esse produto consta com ${labelUnidades} em estoque, seu saldo é suficiente para essa semana (cobre ~${diasCobertura} dias • meta semanal: ${metaUnidades7d} un • vendeu ${vendas30d} un em 30d e ${vendas10m} un em 10 meses).`;
        } else if (saldo > 0 && vmd <= 0 && vendas30d === 0) {
          justificativaNaoComprar = `Esse produto consta com ${labelUnidades} em estoque, seu saldo é suficiente para essa semana (0 vendas nos últimos 30 dias • ${vendas10m} un vendidas em 10 meses • Curva ${r.curva_abc}).`;
        } else if (saldo <= 0 && vendas30d === 0 && vendas10m === 0) {
          justificativaNaoComprar = `Esse produto consta com 0 unidades em estoque e não teve vendas registradas nos últimos 10 meses (Curva ${r.curva_abc}) — se desejar reativar na loja, grave em "⭐ Produtos Desejados".`;
        } else {
          justificativaNaoComprar = `Esse produto consta com ${labelUnidades} em estoque, seu saldo é suficiente para essa semana (Vendas 30d: ${vendas30d} un • Vendas 10m: ${vendas10m} un • Curva ${r.curva_abc}).`;
        }

        const precoRef = Number(r.preco_unitario_ult_compra || r.custo_unitario || 5.0);
        const qtdSugeridaInclusao = regDesejado ? (Number(regDesejado.qtd_sugerida) || 1) : Math.max(1, metaUnidades7d - saldo);
        const cotsEan = (eanTrim && cotacoesPorEan[eanTrim]) || [];

        return {
          produto_id: r.produto_id,
          descricao: r.descricao,
          apresentacao: r.apresentacao || '',
          ean: eanTrim,
          curva_abc: r.curva_abc || 'C',
          saldo,
          vmd_ponderado: Number(vmd.toFixed(2)),
          vendas_30d: vendas30d,
          vendas_31_60d: vendas60d,
          vendas_61_90d: vendas90dIsolado,
          vendas_90d: vendas90dTotal,
          vendas_6m: vendas6m,
          vendas_10m: vendas10m,
          entradas_10m: entradas10m,
          dias_cobertura: diasCobertura,
          preco_ult_compra: Number(precoRef.toFixed(2)),
          preco_venda: Number((Number(r.preco_venda_vigente) || 0).toFixed(2)),
          fornecedor_ult_compra: r.ultima_compra_fornecedor || 'Não registrado',
          ultima_compra_data: r.ultima_compra_data || null,
          fornecedor_1: cotsEan[0] ? cotsEan[0].fornecedor : null,
          preco_1: cotsEan[0] ? Number(cotsEan[0].preco) : null,
          fornecedor_2: cotsEan[1] ? cotsEan[1].fornecedor : null,
          preco_2: cotsEan[1] ? Number(cotsEan[1].preco) : null,
          qtd_sugerida: qtdSugeridaInclusao,
          ja_na_cotacao: jaNaCotacao,
          is_desejado: isAvulso,
          id_desejado: regDesejado ? regDesejado.id : null,
          motivo_desejado: regDesejado ? regDesejado.motivo : null,
          justificativa_compra: justificativaNaoComprar
        };
      });

      const resumoPesquisa = {
        termo: q,
        total_encontrados: produtosAnalisados.length,
        com_vendas_historico: comVendasHistorico,
        com_estoque: comEstoque,
        zerados_com_giro: zeradosComGiro,
        sem_giro_zerados: semGiroZerados,
        soma_vendas_30d: somaVendas30d,
        soma_vendas_90d: somaVendas90d,
        soma_vendas_10m: somaVendas10m,
        soma_estoque_atual: somaEstoqueAtual
      };

      res.json({
        success: true,
        produtos: produtosAnalisados,
        resultados: produtosAnalisados,
        resumo_pesquisa: resumoPesquisa
      });
    } catch (err) {
      console.error('[BelaPed] Erro em buscar-estoque-real:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * POST /api/belaped/comprar-carrinho
   * Executa a compra direta no portal da distribuidora via robô com o prazo eleito
   * e já lança automaticamente na guia "Pedidos" (orders + boletos) do Belinha!
   */
  router.post('/comprar-carrinho', async (req, res) => {
    try {
      const { distribuidora, carrinho, prazoEscolhido, parcelasCustomizadas } = req.body;
      if (!distribuidora) {
        return res.status(400).json({ success: false, error: 'Distribuidora é obrigatória.' });
      }

      const itens = carrinho?.itens || [];
      const valorTotal = Number(carrinho?.total) || 0;

      const configPortal = db.prepare('SELECT pedido_minimo FROM belaped_portais WHERE upper(nome) = upper(?) OR id = lower(?)').get(distribuidora, distribuidora);
      const minOficial = configPortal ? Number(configPortal.pedido_minimo) : 300;
      if (valorTotal < minOficial) {
        return res.status(400).json({
          success: false,
          error: `PEDIDO_BLOQUEADO: Pedido em ${distribuidora} (R$ ${valorTotal.toFixed(2)}) abaixo do pedido mínimo de R$ ${minOficial.toFixed(2)}.`
        });
      }

      const robot = obterInstanciaRobo(distribuidora);

      if (!robot) {
        return res.status(400).json({ success: false, error: `Robô não disponível para ${distribuidora}.` });
      }

      console.log(`[BelaPed Compra Direta] 🚀 Disparando compra na ${distribuidora}... Prazo: ${prazoEscolhido} | Total: R$ ${valorTotal}`);

      let resultadoCompra = null;
      try {
        await robot.iniciar();
        resultadoCompra = await executarCheckoutRobo(distribuidora, robot, {
          prazoEscolhido,
          valorTotal,
          itens,
          parcelasCustomizadas: parcelasCustomizadas || carrinho?.parcelasCalculadas || null
        });
      } finally {
        await robot.fechar().catch(() => {});
      }

      // Registra no banco de dados belaped_pedidos
      const pedidoId = crypto.randomUUID();
      let lancamentoBelinha = null;
      try {
        db.prepare(`
          INSERT INTO belaped_pedidos (
            id, distribuidora, status, total, qtd_itens, prazo_previsto,
            numero_pedido_portal, comprovante_url, prazo_escolhido, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `).run(
          pedidoId,
          distribuidora,
          resultadoCompra?.sucesso ? 'FINALIZADO_PELO_ROBO' : 'ERRO_COMPRA',
          valorTotal,
          itens.length,
          prazoEscolhido,
          resultadoCompra?.numeroPedido || null,
          resultadoCompra?.comprovanteUrl || null,
          prazoEscolhido
        );

        if (Array.isArray(itens) && itens.length > 0) {
          const insertItem = db.prepare(`
            INSERT INTO belaped_pedidos_itens (pedido_id, ean, descricao, qtd_pedida, preco_cotado)
            VALUES (?, ?, ?, ?, ?)
          `);
          itens.forEach(it => {
            insertItem.run(pedidoId, it.ean || null, it.descricao || '', Number(it.quantidade) || 1, Number(it.precoUnitario) || 0);
          });
        }

        // Lança automaticamente na guia "Pedidos" do Belinha (orders + boletos)
        if (resultadoCompra?.sucesso) {
          lancamentoBelinha = lancarPedidoNaGuiaBelinha({
            distribuidora,
            valorTotal,
            prazoEscolhido,
            parcelasCustomizadas: parcelasCustomizadas || carrinho?.parcelasCalculadas || null,
            itens,
            numeroPedido: resultadoCompra?.numeroPedido || ''
          });
        }
      } catch (dbErr) {
        console.warn('[BelaPed Compra Direta] Erro ao gravar pedido no banco:', dbErr.message);
      }

      res.json({
        success: resultadoCompra?.sucesso || false,
        resultado: resultadoCompra,
        pedidoId,
        lancamentoBelinha
      });
    } catch (err) {
      console.error('[BelaPed] Erro em comprar-carrinho:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PEDIDOS (histórico/acompanhamento)
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
        numero_pedido_portal TEXT,
        comprovante_url TEXT,
        prazo_escolhido TEXT,
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
    try { db.exec(`ALTER TABLE belaped_pedidos ADD COLUMN numero_pedido_portal TEXT;`); } catch (e) {}
    try { db.exec(`ALTER TABLE belaped_pedidos ADD COLUMN comprovante_url TEXT;`); } catch (e) {}
    try { db.exec(`ALTER TABLE belaped_pedidos ADD COLUMN prazo_escolhido TEXT;`); } catch (e) {}
  } catch (e) {
    console.error('[BelaPed] Erro ao criar tabelas de pedidos:', e.message);
  }

  const STATUS_PEDIDO = ['RASCUNHO', 'CARRINHO_GERADO', 'FINALIZADO_PELO_ROBO', 'FINALIZADO_PELO_USUARIO', 'ERRO_COMPRA', 'FATURADO', 'RECEBIDO', 'CANCELADO'];

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
   * Compara com o pedido, audita cortes, atualiza boletos/orçamento e re-enfileira itens cortados.
   */
  router.put('/pedidos/:id/conferencia', (req, res) => {
    try {
      const { itens } = req.body || {};
      if (!Array.isArray(itens)) return res.status(400).json({ success: false, error: 'Informe itens.' });

      const resultado = processarConferenciaCortes({
        db,
        pedidoId: req.params.id,
        itensConferidos: itens
      });

      res.json(resultado);
    } catch (err) {
      console.error('[BelaPed] Erro em conferencia de pedido:', err.message);
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

belapedEndpoints.processarConferenciaCortes = processarConferenciaCortes;

module.exports = belapedEndpoints;
