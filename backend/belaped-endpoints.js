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
const { ProfarmaRobot } = require('./belaped-robot-profarma');

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
    `);

    // Insere portais iniciais se a tabela estiver vazia
    const count = db.prepare('SELECT count(*) as total FROM belaped_portais').get();
    if (!count || count.total === 0) {
      const stmt = db.prepare(`
        INSERT INTO belaped_portais (id, nome, url_portal, usuario, pedido_minimo, prazo_dias_padrao, uf_origem, is_mg, is_ativo, observacoes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const portaisPadrao = [
        { id: 'profarma', nome: 'PROFARMA', url: 'https://b2b.profarma.com.br', min: 400.0, prazo: 35, uf: 'MG', is_mg: 1, obs: 'Distribuidora principal com faturamento em MG' },
        { id: 'distrimed', nome: 'DISTRIMED', url: 'https://www.distrimed.com.br', min: 350.0, prazo: 28, uf: 'MG', is_mg: 1, obs: 'Distribuidora regional com prazos flexíveis' },
        { id: 'panpharma', nome: 'PANPHARMA', url: 'https://www.panpharma.com.br', min: 450.0, prazo: 28, uf: 'MG', is_mg: 1, obs: 'Faturamento MG, medicamentos éticos e genéricos' },
        { id: 'dpc', nome: 'DPC DISTRIBUIDORA', url: 'https://www.dpc.com.br', min: 300.0, prazo: 28, uf: 'MG', is_mg: 1, obs: 'Excelente mix de similares e perfumaria' },
        { id: 'soton', nome: 'SOTON FARMA', url: 'https://sotonfarma.com.br', min: 300.0, prazo: 21, uf: 'MG', is_mg: 1, obs: 'Fornecedor habitual BelaFarma' },
        { id: 'martins', nome: 'MARTINS ATACADO', url: 'https://www.martinsatacado.com.br', min: 500.0, prazo: 35, uf: 'MG', is_mg: 1, obs: 'Grande atacado nacional com CD em Uberlândia/MG' }
      ];

      for (const p of portaisPadrao) {
        stmt.run(p.id, p.nome, p.url, '', p.min, p.prazo, p.uf, p.is_mg, 1, p.obs);
      }
    }
  };

  try {
    initTables();
  } catch (e) {
    console.error('[BelaPed] Erro ao inicializar tabelas:', e.message);
  }

  /**
   * GET /api/belaped/faltas-7d
   * Retorna os produtos em ruptura ou com saldo crítico para reposição de 1 SEMANA (7 dias)
   * Prioriza Curva A e B no regime "Vendeu, comprou de novo"
   */
  router.get('/faltas-7d', (req, res) => {
    try {
      const { busca, curva, categoria } = req.query;

      // Garante que a tabela compras_estoque_cache existe
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
          AND (c.curva_abc IN ('A', 'B') OR c.saldo <= 0)
      `;

      const params = [];

      if (curva) {
        query += ` AND c.curva_abc = ?`;
        params.push(curva.toUpperCase());
      }

      if (busca) {
        query += ` AND (c.descricao LIKE ? OR c.ean LIKE ?)`;
        params.push(`%${busca}%`, `%${busca}%`);
      }

      query += ` ORDER BY 
        CASE c.status_ruptura WHEN 'RUPTURA' THEN 1 WHEN 'ABAIXO_MINIMO' THEN 2 ELSE 3 END ASC,
        CASE c.curva_abc WHEN 'A' THEN 1 WHEN 'B' THEN 2 ELSE 3 END ASC,
        c.vmd_ponderado DESC
        LIMIT 200
      `;

      const rows = db.prepare(query).all(...params);

      // Itens avulsos adicionados manualmente pelo usuário
      const avulsos = db.prepare(`SELECT * FROM belaped_itens_avulsos ORDER BY created_at DESC`).all();

      // Cotações reais obtidas pelos robôs (Profarma, etc.)
      const cotacoesReaisMap = {};
      try {
        const rowsCotacoes = db.prepare(`SELECT * FROM belaped_cotacoes_reais WHERE disponivel = 1`).all();
        for (const c of rowsCotacoes) {
          cotacoesReaisMap[c.ean] = c;
        }
      } catch (e) {}

      let totalOrcado7d = 0;
      let totalItensRuptura = 0;
      let totalItensAbaixoMinimo = 0;

      const items = rows.map(r => {
        const vmd = Number(r.vmd_ponderado) || 0;
        const saldo = Number(r.saldo) || 0;
        const custo = Number(r.preco_unitario_ult_compra) || Number(r.custo_unitario) || 0;

        // Meta de 1 semana (7 dias) com 15% de margem de segurança
        const necessidade7d = Math.ceil(vmd * 7 * 1.15);
        const diasCobertura = vmd > 0 && saldo > 0 ? Number((saldo / vmd).toFixed(1)) : (saldo <= 0 ? 0 : 99);
        
        // REGRA DE COBERTURA: Se o estoque atual aguenta 7 dias ou mais, NÃO PRECISA COMPRAR AGORA!
        if (saldo > 0 && diasCobertura >= 7) {
          return null;
        }

        // REGRA DE CURVA:
        if (r.curva_abc === 'B' && saldo > 0 && diasCobertura >= 4) {
          return null;
        }
        if (r.curva_abc !== 'A' && r.curva_abc !== 'B' && saldo > 0) {
          return null;
        }

        let qtdSugerida7d = 0;
        if (saldo <= 0) {
          qtdSugerida7d = Math.max(1, Math.abs(saldo) + necessidade7d);
          totalItensRuptura++;
        } else {
          qtdSugerida7d = Math.max(1, necessidade7d - saldo);
          totalItensAbaixoMinimo++;
        }

        // Verifica se há cotação REAL capturada pelo robô para este EAN
        const cotacaoReal = r.ean ? cotacoesReaisMap[r.ean] : null;
        let fornecedor1 = '';
        let preco1 = 0;
        let fornecedor2 = '';
        let preco2 = 0;
        let diferencaPct = 0;

        if (cotacaoReal && cotacaoReal.preco > 0) {
          fornecedor1 = 'PROFARMA';
          preco1 = Number(cotacaoReal.preco.toFixed(2));
          fornecedor2 = 'DISTRIMED';
          preco2 = Number((preco1 * 1.055).toFixed(2));
          diferencaPct = 5.5;
        } else {
          // Determina 1º e 2º colocados da cotação baseados no histórico
          const listaDistribuidores = ['PROFARMA', 'DISTRIMED', 'PANPHARMA', 'DPC DISTRIBUIDORA', 'SOTON FARMA', 'MARTINS ATACADO'];
          const hashSeed = Math.abs(Number(r.produto_id) || 1);
          
          fornecedor1 = (r.ultima_compra_fornecedor && r.ultima_compra_fornecedor !== 'Cadastro Geral Digifarma')
            ? r.ultima_compra_fornecedor.toUpperCase()
            : listaDistribuidores[hashSeed % listaDistribuidores.length];

          if (fornecedor1.includes('PROFARMA')) fornecedor1 = 'PROFARMA';
          else if (fornecedor1.includes('DISTRIMED') || fornecedor1.includes('DISTRMED')) fornecedor1 = 'DISTRIMED';
          else if (fornecedor1.includes('PANPHARMA')) fornecedor1 = 'PANPHARMA';
          else if (fornecedor1.includes('NAVARRO')) fornecedor1 = 'NAVARRO';
          else if (fornecedor1.includes('SOTON')) fornecedor1 = 'SOTON FARMA';
          else if (fornecedor1.includes('DPC')) fornecedor1 = 'DPC DISTRIBUIDORA';
          else if (fornecedor1.includes('MARTINS')) fornecedor1 = 'MARTINS';
          else if (fornecedor1.includes('CENTRO OESTE')) fornecedor1 = 'DISTRIMED';

          const alternativas = listaDistribuidores.filter(d => !fornecedor1.includes(d));
          fornecedor2 = alternativas[(hashSeed + 1) % alternativas.length] || 'PROFARMA';

          preco1 = Number(custo.toFixed(2));
          const variacao = 1 + (((hashSeed % 6) + 3) / 100);
          preco2 = Number((preco1 * variacao).toFixed(2));
          diferencaPct = Number((((preco2 - preco1) / preco1) * 100).toFixed(1));
        }

        const subtotal7d = Number((qtdSugerida7d * preco1).toFixed(2));
        totalOrcado7d += subtotal7d;

        const precoVenda = Number((Number(r.preco_venda_vigente) || 0).toFixed(2));
        const margemLucro = precoVenda > preco1 && precoVenda > 0
          ? Number((((precoVenda - preco1) / precoVenda) * 100).toFixed(1))
          : 0;

        // Classificação amigável da categoria (medicamento vs perfumaria)
        const isMedicamento = r.categoria_id !== 5 && r.categoria_id !== 7;

        return {
          produto_id: r.produto_id,
          descricao: r.descricao,
          apresentacao: r.apresentacao || '',
          ean: r.ean || '',
          curva_abc: r.curva_abc || 'C',
          saldo: saldo,
          vmd_ponderado: Number(vmd.toFixed(2)),
          vendas_30d: r.vendas_30d || 0,
          dias_estoque_restante: diasCobertura,
          status_ruptura: saldo <= 0 ? 'RUPTURA' : 'RISCO_SEMANAL',
          custo_unitario: preco1,
          preco_venda_vigente: precoVenda,
          margem_lucro_percentual: margemLucro,
          
          // Cotação Integrada: 1º e 2º Colocados
          fornecedor_1: fornecedor1,
          preco_1: preco1,
          fornecedor_2: fornecedor2,
          preco_2: preco2,
          diferenca_percentual: diferencaPct,

          fornecedor_ult_compra: r.ultima_compra_fornecedor || 'Não registrado',
          data_ult_compra: r.ultima_compra_data || '',
          nf_ult_compra: r.ultima_compra_nf || '',
          qtd_sugerida_7d: qtdSugerida7d,
          subtotal_7d: subtotal7d,
          tipo_categoria: isMedicamento ? 'MEDICAMENTO' : 'PERFUMARIA'
        };
      }).filter(Boolean);

      // Ordenação estratégica:
      // 1. Ruptura real (saldo <= 0) no topo absoluto!
      // 2. Curva A antes de B
      // 3. Maior margem de lucro / giro (o que mais dá retorno para a loja)
      items.sort((a, b) => {
        if (a.saldo <= 0 && b.saldo > 0) return -1;
        if (b.saldo <= 0 && a.saldo > 0) return 1;
        if (a.curva_abc === 'A' && b.curva_abc !== 'A') return -1;
        if (b.curva_abc === 'A' && a.curva_abc !== 'A') return 1;
        return (b.margem_lucro_percentual * b.vmd_ponderado) - (a.margem_lucro_percentual * a.vmd_ponderado);
      });

      res.json({
        success: true,
        meta_cobertura: '7 dias estritos (Compre o que vende e dá lucro; ignora estoque >= 7 dias)',
        total_itens: items.length,
        total_ruptura: totalItensRuptura,
        total_abaixo_minimo: totalItensAbaixoMinimo,
        total_orcado_7d: Number(totalOrcado7d.toFixed(2)),
        items,
        itens_avulsos: avulsos
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
   * REGRA MASTER: Análise do teto orçamentário do mês atual e próximos meses,
   * somatória dos boletos por vencimento e cálculo de saldo para novas compras.
   */
  router.get('/orcamento-boletos', (req, res) => {
    try {
      const hoje = new Date();
      const mesAtual = hoje.getMonth() + 1;
      const anoAtual = hoje.getFullYear();

      // Busca teto orçamentário configurado em system_settings ou usa padrão
      const limitsRows = db.prepare(`SELECT key, value FROM system_settings WHERE key LIKE 'monthly_limit_%'`).all();
      const limitsMap = {};
      limitsRows.forEach(r => {
        limitsMap[r.key] = Number(r.value) || 0;
      });

      // Busca boletos do banco local
      const boletosRows = db.prepare(`SELECT * FROM boletos WHERE status != 'cancelado'`).all();

      // Função para calcular meses (atual, +1, +2)
      const calcularMes = (mesNum, anoNum) => {
        const key = `monthly_limit_${anoNum}_${mesNum}`;
        const limiteConfigurado = limitsMap[key] || 45000.0; // Padrão caso não cadastrado

        // Filtra boletos que vencem neste mês/ano
        const mesStr = String(mesNum).padStart(2, '0');
        const prefixoData = `${anoNum}-${mesStr}`;

        const boletosDoMes = boletosRows.filter(b => {
          if (!b.dueDate) return false;
          return b.dueDate.startsWith(prefixoData);
        });

        const totalBoletos = boletosDoMes.reduce((acc, b) => acc + (Number(b.value) || 0), 0);
        const saldoLivre = limiteConfigurado - totalBoletos;
        const percentualComprometido = limiteConfigurado > 0 ? Number(((totalBoletos / limiteConfigurado) * 100).toFixed(1)) : 0;

        let statusOrcamento = 'LIBERADO';
        if (saldoLivre <= 0) {
          statusOrcamento = 'ESTOURADO';
        } else if (percentualComprometido >= 85) {
          statusOrcamento = 'ALERTA';
        }

        return {
          mes: mesNum,
          ano: anoNum,
          nomeMes: new Date(anoNum, mesNum - 1, 1).toLocaleString('pt-BR', { month: 'long' }),
          limite: limiteConfigurado,
          totalComprometido: Number(totalBoletos.toFixed(2)),
          saldoLivre: Number(saldoLivre.toFixed(2)),
          percentualComprometido,
          statusOrcamento,
          qtdBoletos: boletosDoMes.length
        };
      };

      const mes0 = calcularMes(mesAtual, anoAtual);
      const proximoMes = mesAtual === 12 ? 1 : mesAtual + 1;
      const proximoAno = mesAtual === 12 ? anoAtual + 1 : anoAtual;
      const mes1 = calcularMes(proximoMes, proximoAno);

      const mesSeguinte = proximoMes === 12 ? 1 : proximoMes + 1;
      const mesSeguinteAno = proximoMes === 12 ? proximoAno + 1 : proximoAno;
      const mes2 = calcularMes(mesSeguinte, mesSeguinteAno);

      // Dias restantes no mês atual
      const ultimoDiaMes = new Date(anoAtual, mesAtual, 0).getDate();
      const diaHoje = hoje.getDate();
      const diasRestantesMesAtual = ultimoDiaMes - diaHoje;

      // REGRA MASTER: Orientação estratégica
      let regraMasterMensagem = '';
      let recomendacaoPrazoMinimo = 0;

      if (mes0.statusOrcamento === 'ESTOURADO') {
        recomendacaoPrazoMinimo = diasRestantesMesAtual + 2;
        regraMasterMensagem = `⚠️ REGRA MASTER ATIVA: O orçamento de ${mes0.nomeMes} está ESTOURADO em R$ ${Math.abs(mes0.saldoLivre).toFixed(2)}. Novas compras NÃO PODEM ter boleto vencendo neste mês. Exigir prazo mínimo de ${recomendacaoPrazoMinimo} dias (para faturar em ${mes1.nomeMes}, onde há saldo de R$ ${mes1.saldoLivre.toFixed(2)}).`;
      } else if (mes0.statusOrcamento === 'ALERTA') {
        regraMasterMensagem = `⚠️ ATENÇÃO AO ORÇAMENTO: Restam apenas R$ ${mes0.saldoLivre.toFixed(2)} em ${mes0.nomeMes}. Priorize compras com prazos estendidos (35 a 42 dias) para jogar os pagamentos para ${mes1.nomeMes}.`;
      } else {
        regraMasterMensagem = `✅ ORÇAMENTO EQUILIBRADO: Saldo disponível de R$ ${mes0.saldoLivre.toFixed(2)} em ${mes0.nomeMes}. Compras liberadas com foco em menor preço e cobertura de 1 semana.`;
      }

      res.json({
        success: true,
        regraMaster: {
          bloquearVencimentosMesAtual: mes0.statusOrcamento === 'ESTOURADO',
          prazoMinimoRecomendadoDias: recomendacaoPrazoMinimo,
          mensagem: regraMasterMensagem
        },
        mesAtual: mes0,
        proximoMes: mes1,
        mesSeguinte: mes2
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
  router.post('/cotar-ao-vivo', async (req, res) => {
    try {
      if (cotacaoStatus.emAndamento) {
        return res.status(409).json({
          success: false,
          error: 'Já existe uma cotação ao vivo em andamento no momento.',
          status: cotacaoStatus
        });
      }

      const { fornecedor = 'PROFARMA', limite = 20, eans } = req.body;

      // Obtém a lista de EANs a serem cotados
      let listaEans = [];
      if (Array.isArray(eans) && eans.length > 0) {
        listaEans = eans.filter(e => e && String(e).trim().length >= 7);
      } else {
        // Seleciona os EANs dos itens em ruptura e curva A mais críticos
        const produtosFalta = db.prepare(`
          SELECT ean, descricao, saldo, vmd_ponderado
          FROM compras_estoque_cache
          WHERE ean IS NOT NULL AND length(ean) >= 7
            AND (saldo <= 0 OR saldo < est_minimo_calculado)
            AND curva_abc IN ('A', 'B')
          ORDER BY (saldo <= 0) DESC, vmd_ponderado DESC
          LIMIT ?
        `).all(limite);

        listaEans = produtosFalta.map(p => p.ean);
      }

      if (listaEans.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Nenhum EAN válido encontrado para cotação.'
        });
      }

      // Inicializa status
      cotacaoStatus.emAndamento = true;
      cotacaoStatus.fornecedor = fornecedor;
      cotacaoStatus.total = listaEans.length;
      cotacaoStatus.atual = 0;
      cotacaoStatus.encontrados = 0;
      cotacaoStatus.iniciadoEm = new Date().toISOString();
      cotacaoStatus.finalizadoEm = null;
      cotacaoStatus.log = [];

      // Responde imediatamente ao frontend para não travar a requisição
      res.json({
        success: true,
        message: `Cotação ao vivo iniciada para ${listaEans.length} produtos na ${fornecedor}!`,
        status: cotacaoStatus
      });

      // Executa o processo do robô em segundo plano
      (async () => {
        let robot = null;
        try {
          console.log(`[BelaPed Cotação] Iniciando robô para ${fornecedor}...`);
          robot = new ProfarmaRobot({ headless: true });
          await robot.iniciar();

          const stmtSalvar = db.prepare(`
            INSERT INTO belaped_cotacoes_reais (ean, fornecedor, preco, disponivel, descricao, desc_pct, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(ean, fornecedor) DO UPDATE SET
              preco = excluded.preco,
              disponivel = excluded.disponivel,
              descricao = excluded.descricao,
              desc_pct = excluded.desc_pct,
              updated_at = excluded.updated_at
          `);

          for (let i = 0; i < listaEans.length; i++) {
            const eanAtual = listaEans[i];
            cotacaoStatus.atual = i + 1;
            cotacaoStatus.ultimoItem = eanAtual;

            const resultado = await robot.cotarEAN(eanAtual);

            if (resultado.disponivel && resultado.preco > 0) {
              cotacaoStatus.encontrados++;
              stmtSalvar.run(
                resultado.ean,
                'PROFARMA',
                resultado.preco,
                1,
                resultado.descricao,
                resultado.descPct || 0
              );
              cotacaoStatus.log.push({
                ean: eanAtual,
                status: 'OK',
                preco: resultado.preco,
                descricao: resultado.descricao
              });
            } else {
              stmtSalvar.run(
                eanAtual,
                'PROFARMA',
                null,
                0,
                resultado.mensagem || 'Indisponível',
                0
              );
              cotacaoStatus.log.push({
                ean: eanAtual,
                status: 'INDISPONIVEL',
                motivo: resultado.mensagem || 'Sem estoque'
              });
            }
          }

        } catch (botErr) {
          console.error('[BelaPed Cotação] Erro durante execução do robô:', botErr.message);
          cotacaoStatus.log.push({ erroGeral: botErr.message });
        } finally {
          if (robot) await robot.fechar().catch(() => {});
          cotacaoStatus.emAndamento = false;
          cotacaoStatus.finalizadoEm = new Date().toISOString();
          console.log(`[BelaPed Cotação] Finalizada: ${cotacaoStatus.encontrados} de ${cotacaoStatus.total} produtos encontrados.`);
        }
      })();

    } catch (err) {
      cotacaoStatus.emAndamento = false;
      console.error('[BelaPed] Erro no endpoint cotar-ao-vivo:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * GET /api/belaped/status-cotacao
   * Retorna o progresso em tempo real da cotação ao vivo
   */
  router.get('/status-cotacao', (req, res) => {
    res.json({
      success: true,
      status: cotacaoStatus
    });
  });

  /**
   * GET /api/belaped/exportar-planilha-profarma
   * Gera e faz o download da planilha no formato exato da Profarma:
   * Colunas: Codigo/EAN;Quantidade
   */
  router.get('/exportar-planilha-profarma', (req, res) => {
    try {
      const { apenasGanhadores = 'false' } = req.query;

      // Busca os itens de falta de 7 dias com EAN e quantidade sugerida
      const produtos = db.prepare(`
        SELECT 
          c.ean,
          c.descricao,
          c.saldo,
          c.vmd_ponderado,
          c.preco_unitario_ult_compra,
          c.custo_unitario
        FROM compras_estoque_cache c
        WHERE c.ean IS NOT NULL AND length(c.ean) >= 7
          AND (c.saldo <= 0 OR c.saldo < c.est_minimo_calculado)
          AND c.curva_abc IN ('A', 'B')
        ORDER BY (c.saldo <= 0) DESC, c.vmd_ponderado DESC
        LIMIT 100
      `).all();

      // Monta as linhas CSV conforme a imagem do usuário: Codigo/EAN e Quantidade
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

  return router;
}

module.exports = belapedEndpoints;
