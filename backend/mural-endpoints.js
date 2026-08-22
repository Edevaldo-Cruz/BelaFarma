const express = require('express');
const { queryDigifarma } = require('./services/digifarma.service');
const { ehDiaUtilParaMural, formatarDataISO } = require('./services/feriados.service');
const { sincronizarVariacaoPrecosMural } = require('./services/entradas-sync.service');

function categorizarProduto(descricao = '', categoriaNome = '') {
  const desc = (descricao || '').toUpperCase();
  const cat = (categoriaNome || '').toUpperCase();

  if (desc.includes('GENERICO') || desc.includes('GENÉRIC') || desc.includes(' GEN ') || desc.startsWith('GEN ')) {
    return 'GENERICO';
  }
  if (desc.includes('SIMILAR')) {
    return 'SIMILAR';
  }
  if (
    cat.includes('PERFUMARIA') ||
    desc.includes('SHAMPOO') ||
    desc.includes('SABONETE') ||
    desc.includes('DESODORANTE') ||
    desc.includes('CREME') ||
    desc.includes('FRALDA') ||
    desc.includes('PERFUME') ||
    desc.includes('ESCOVA') ||
    desc.includes('PASTA') ||
    desc.includes('CONDICIONADOR') ||
    desc.includes('HIDRATANTE')
  ) {
    return 'PERFUMARIA';
  }
  if (cat.includes('MEDICAMENTO') || cat.includes('ETICO') || cat.includes('REFERENCIA') || cat.includes('MARCA')) {
    return 'MARCA';
  }
  return 'MARCA';
}

module.exports = function (db) {
  const router = express.Router();

  // Inicializa tabelas necessárias
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS mural_produtos_parados (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        user_name TEXT,
        produto_id INTEGER NOT NULL,
        descricao TEXT NOT NULL,
        cod_barras TEXT,
        apresentacao TEXT,
        categoria TEXT,
        saldo REAL DEFAULT 0,
        preco_venda REAL DEFAULT 0,
        preco_compra REAL DEFAULT 0,
        valor_total_parado REAL DEFAULT 0,
        dias_parado INTEGER DEFAULT 90,
        data_atribuicao TEXT NOT NULL,
        status TEXT DEFAULT 'pendente',
        acao_tomada TEXT,
        acao_detalhe TEXT,
        data_resolucao TEXT,
        resolvido_por TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE IF NOT EXISTS mural_config (
        chave TEXT PRIMARY KEY,
        valor TEXT
      );

      CREATE TABLE IF NOT EXISTS mural_variacao_precos (
        id TEXT PRIMARY KEY,
        produto_id INTEGER NOT NULL,
        descricao TEXT NOT NULL,
        cod_barras TEXT,
        apresentacao TEXT,
        custo_anterior REAL DEFAULT 0,
        custo_novo REAL DEFAULT 0,
        variacao_percentual REAL DEFAULT 0,
        preco_venda_atual REAL DEFAULT 0,
        preco_venda_sugerido REAL DEFAULT 0,
        margem_atual REAL DEFAULT 0,
        margem_nova_se_manter REAL DEFAULT 0,
        fornecedor TEXT,
        nota_fiscal TEXT,
        data_entrada TEXT NOT NULL,
        status TEXT DEFAULT 'pendente',
        novo_preco_aplicado REAL,
        acao_tomada TEXT,
        resolvido_por TEXT,
        resolvido_em TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );

      CREATE INDEX IF NOT EXISTS idx_mural_user_status ON mural_produtos_parados(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_mural_data_atrib ON mural_produtos_parados(data_atribuicao);
      CREATE INDEX IF NOT EXISTS idx_mural_var_status ON mural_variacao_precos(status);
      CREATE INDEX IF NOT EXISTS idx_mural_var_data ON mural_variacao_precos(data_entrada);
    `);
  } catch (err) {
    console.error('[Mural API] Erro ao inicializar tabelas:', err.message);
  }

  /**
   * Busca produtos parados há +90 dias no Digifarma com saldo > 0
   * Ordenados por maior valor parado (saldo * custo/compra desc)
   */
  async function buscarProdutosParadosDigifarma(limit = 100) {
    try {
      const sql = `
        SELECT FIRST ${limit}
          p.PRODUTO_ID,
          p.PRODUTO,
          p.APRESENTACAO,
          p.COD_BARRAS,
          p.PROD_SALDO,
          p.PROD_PRVENDA,
          COALESCE(p.PROD_PRCOMPRA, p.VALOR_ULT_COMPRA, 0) as PROD_PRCOMPRA,
          (p.PROD_SALDO * COALESCE(p.PROD_PRCOMPRA, p.VALOR_ULT_COMPRA, p.PROD_PRVENDA, 0)) as VALOR_TOTAL_PARADO,
          c.CATEGORIA as CATEGORIA_NOME
        FROM PRODUTOS p
        LEFT JOIN CATEGORIA c ON p.CATEGORIA_ID = c.CATEGORIA_ID
        WHERE p.PROD_ATIVO = 'S'
          AND p.PROD_SALDO > 0
          AND NOT EXISTS (
            SELECT FIRST 1 1 
            FROM ITEM_VENDAS iv
            JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
            WHERE iv.PRODUTO_ID = p.PRODUTO_ID 
              AND v.CANCELADO <> 'S'
              AND v.VENDA_DATA_HORA >= CAST('NOW' AS TIMESTAMP) - 90
          )
        ORDER BY VALOR_TOTAL_PARADO DESC, p.PROD_SALDO DESC
      `;
      const prods = await queryDigifarma(sql);
      return prods || [];
    } catch (e) {
      console.error('[Mural API] Erro ao buscar produtos parados do Digifarma:', e.message);
      return [];
    }
  }

  /**
   * Gera e distribui 15 produtos para cada usuário ativo
   */
  async function gerarDistribuicaoDiaria(force = false) {
    const hojeStr = formatarDataISO(new Date());

    if (!force) {
      if (!ehDiaUtilParaMural(hojeStr)) {
        console.log(`[Mural Diário] Hoje (${hojeStr}) é domingo ou feriado nacional. Não gera lista.`);
        return { success: true, message: 'Domingo ou feriado - geração dispensada.', totalGerado: 0 };
      }

      const jaGerouHoje = db.prepare(`
        SELECT COUNT(*) as qtd FROM mural_produtos_parados WHERE data_atribuicao = ?
      `).get(hojeStr);

      if (jaGerouHoje && jaGerouHoje.qtd > 0) {
        console.log(`[Mural Diário] Lista para ${hojeStr} já foi gerada anteriormente (${jaGerouHoje.qtd} itens).`);
        return { success: true, message: 'Lista do dia já gerada.', totalGerado: jaGerouHoje.qtd };
      }
    }

    // Identificar usuários ativos
    let activeUsers = [];
    try {
      activeUsers = db.prepare('SELECT id, name FROM users').all();
    } catch (e) {
      console.warn('[Mural Diário] Tabela users não acessível:', e.message);
    }

    if (!activeUsers || activeUsers.length === 0) {
      activeUsers = [
        { id: 'usr_edevaldo', name: 'Edevaldo' },
        { id: 'usr_nayane', name: 'Nayane' }
      ];
    } else {
      // Garante que se tivermos Edevaldo e Nayane no sistema, ambos estejam presentes
      const hasEdevaldo = activeUsers.some(u => u.name && u.name.toLowerCase().includes('edevaldo'));
      const hasNayane = activeUsers.some(u => u.name && u.name.toLowerCase().includes('nayane'));
      if (!hasNayane) {
        activeUsers.push({ id: 'usr_nayane', name: 'Nayane' });
      }
      if (!hasEdevaldo) {
        activeUsers.push({ id: 'usr_edevaldo', name: 'Edevaldo' });
      }
    }

    // Busca produtos já atribuídos nos últimos 30 dias para evitar repetição rápida
    const prodsRecentes = db.prepare(`
      SELECT DISTINCT produto_id 
      FROM mural_produtos_parados 
      WHERE data_atribuicao >= date('now', '-30 days')
    `).all().map(r => r.produto_id);

    const prodsRecentesSet = new Set(prodsRecentes);

    // Busca candidatos do Digifarma
    const totalNecessario = activeUsers.length * 15;
    const candidatos = await buscarProdutosParadosDigifarma(totalNecessario * 4);

    // Filtra produtos que não foram atribuídos recentemente
    let disponiveis = candidatos.filter(c => !prodsRecentesSet.has(c.PRODUTO_ID));
    if (disponiveis.length < totalNecessario) {
      // Se acabaram os não recentes, usa todos disponíveis ordenados por maior valor parado
      disponiveis = candidatos;
    }

    let insertCount = 0;
    const insertStmt = db.prepare(`
      INSERT INTO mural_produtos_parados (
        id, user_id, user_name, produto_id, descricao, cod_barras, apresentacao, 
        categoria, saldo, preco_venda, preco_compra, valor_total_parado, 
        dias_parado, data_atribuicao, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente')
    `);

    let itemIdx = 0;
    for (const user of activeUsers) {
      let countForUser = 0;
      while (countForUser < 15 && itemIdx < disponiveis.length) {
        const prod = disponiveis[itemIdx++];
        const cat = categorizarProduto(prod.PRODUTO, prod.CATEGORIA_NOME);
        const itemId = `mp_${Date.now()}_${user.id.substring(0, 4)}_${prod.PRODUTO_ID}_${Math.random().toString(36).substring(2, 6)}`;

        try {
          insertStmt.run(
            itemId,
            user.id,
            user.name,
            prod.PRODUTO_ID,
            (prod.PRODUTO || 'Sem Nome').trim(),
            (prod.COD_BARRAS || '').trim(),
            (prod.APRESENTACAO || '').trim(),
            cat,
            prod.PROD_SALDO || 0,
            prod.PROD_PRVENDA || 0,
            prod.PROD_PRCOMPRA || 0,
            prod.VALOR_TOTAL_PARADO || 0,
            90,
            hojeStr
          );
          insertCount++;
          countForUser++;
        } catch (err) {
          console.error('[Mural Diário] Erro ao inserir item:', err.message);
        }
      }
    }

    console.log(`[Mural Diário] ✅ Concluída distribuição diária: ${insertCount} itens distribuídos entre ${activeUsers.length} usuários.`);
    return { success: true, totalGerado: insertCount, data: hojeStr };
  }

  // 1. GET /api/mural/pendencias
  // Retorna todas as pendências acumuladas do usuário logado + estatísticas gerais
  router.get('/pendencias', async (req, res) => {
    try {
      const { userId, userName } = req.query;

      // Executa checagem diária caso ainda não tenha rodado hoje
      const hojeStr = formatarDataISO(new Date());
      if (ehDiaUtilParaMural(hojeStr)) {
        const jaTem = db.prepare("SELECT COUNT(*) as qtd FROM mural_produtos_parados WHERE data_atribuicao = ?").get(hojeStr);
        if (!jaTem || jaTem.qtd === 0) {
          await gerarDistribuicaoDiaria(false);
        }
      }

      let whereClause = "status = 'pendente'";
      const params = [];

      if (userId) {
        // Se forneceu userId ou userName, busca pendências deste usuário
        if (userName) {
          whereClause += " AND (user_id = ? OR LOWER(user_name) LIKE ?)";
          params.push(userId, `%${userName.toLowerCase()}%`);
        } else {
          whereClause += " AND user_id = ?";
          params.push(userId);
        }
      }

      // Produtos parados pendentes (acumulados)
      const produtosParados = db.prepare(`
        SELECT * FROM mural_produtos_parados 
        WHERE ${whereClause}
        ORDER BY valor_total_parado DESC, data_atribuicao ASC
      `).all(...params);

      // Total de pendências por usuário geral
      const resumoPorUsuario = db.prepare(`
        SELECT user_id, user_name, COUNT(*) as pendentes, SUM(valor_total_parado) as total_parado
        FROM mural_produtos_parados
        WHERE status = 'pendente'
        GROUP BY user_id, user_name
      `).all();

      // Estatísticas gerais
      const totalPendentesGeral = db.prepare(`
        SELECT COUNT(*) as qtd FROM mural_produtos_parados WHERE status = 'pendente'
      `).get()?.qtd || 0;

      const totalResolvidosGeral = db.prepare(`
        SELECT COUNT(*) as qtd FROM mural_produtos_parados WHERE status = 'resolvido'
      `).get()?.qtd || 0;

      // Estatísticas de variações de preço para Administradores
      const totalVariacoesPendentes = db.prepare(`
        SELECT COUNT(*) as qtd FROM mural_variacao_precos WHERE status = 'pendente'
      `).get()?.qtd || 0;

      res.json({
        success: true,
        produtosParados,
        totalMinhasPendencias: produtosParados.length,
        totalGeral: totalPendentesGeral,
        totalResolvidos: totalResolvidosGeral,
        totalVariacaoPrecos: totalVariacoesPendentes,
        resumoPorUsuario
      });
    } catch (err) {
      console.error('[Mural API] Erro em /pendencias:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 2. POST /api/mural/resolver-produto
  // Salva a ação tomada e marca como resolvido
  router.post('/resolver-produto', (req, res) => {
    try {
      const { id, acao_tomada, acao_detalhe, resolvido_por } = req.body;
      if (!id || !acao_tomada) {
        return res.status(400).json({ error: 'ID e ação tomada são obrigatórios.' });
      }

      const item = db.prepare('SELECT * FROM mural_produtos_parados WHERE id = ?').get(id);
      if (!item) {
        return res.status(404).json({ error: 'Item não encontrado no mural.' });
      }

      const dataResolucao = new Date().toISOString();

      db.prepare(`
        UPDATE mural_produtos_parados 
        SET status = 'resolvido',
            acao_tomada = ?,
            acao_detalhe = ?,
            data_resolucao = ?,
            resolvido_por = ?
        WHERE id = ?
      `).run(
        acao_tomada,
        acao_detalhe || '',
        dataResolucao,
        resolvido_por || item.user_name || 'Desconhecido',
        id
      );

      res.json({
        success: true,
        message: 'Ação registrada com sucesso e produto resolvido!'
      });
    } catch (err) {
      console.error('[Mural API] Erro em /resolver-produto:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 3. POST /api/mural/gerar-diario (forçar ou rodar manualmente)
  router.post('/gerar-diario', async (req, res) => {
    try {
      const force = req.body.force === true;
      const result = await gerarDistribuicaoDiaria(force);
      res.json(result);
    } catch (err) {
      console.error('[Mural API] Erro em /gerar-diario:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 4. GET /api/mural/historico
  // Consulta de histórico de resoluções
  router.get('/historico', (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 100;
      const historico = db.prepare(`
        SELECT * FROM mural_produtos_parados
        WHERE status = 'resolvido'
        ORDER BY data_resolucao DESC
        LIMIT ?
      `).all(limit);

      res.json({ success: true, historico });
    } catch (err) {
      console.error('[Mural API] Erro em /historico:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 5. GET /api/mural/price-variations
  // Retorna lista de variações de preço para Administradores
  router.get('/price-variations', async (req, res) => {
    try {
      const status = req.query.status || 'pendente';
      
      // Sincroniza se solicitado ou para checar entradas recentes
      if (req.query.sync === 'true') {
        await sincronizarVariacaoPrecosMural(15);
      }

      let items = [];
      if (status === 'todos') {
        items = db.prepare(`
          SELECT * FROM mural_variacao_precos 
          ORDER BY created_at DESC 
          LIMIT 100
        `).all();
      } else {
        items = db.prepare(`
          SELECT * FROM mural_variacao_precos 
          WHERE status = ? 
          ORDER BY data_entrada DESC, created_at DESC
        `).all(status);
      }

      const countPendente = db.prepare(`
        SELECT COUNT(*) as qtd FROM mural_variacao_precos WHERE status = 'pendente'
      `).get()?.qtd || 0;

      const countResolvido = db.prepare(`
        SELECT COUNT(*) as qtd FROM mural_variacao_precos WHERE status = 'resolvido'
      `).get()?.qtd || 0;

      res.json({
        success: true,
        items,
        countPendente,
        countResolvido
      });
    } catch (err) {
      console.error('[Mural API] Erro em /price-variations:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 6. POST /api/mural/price-variations/resolve
  // Salva a decisão sobre o preço sugerido
  router.post('/price-variations/resolve', (req, res) => {
    try {
      const { id, acao, novoPreco, resolvidoPor, observacao } = req.body;
      if (!id || !acao) {
        return res.status(400).json({ error: 'ID e ação são obrigatórios.' });
      }

      const item = db.prepare('SELECT * FROM mural_variacao_precos WHERE id = ?').get(id);
      if (!item) {
        return res.status(404).json({ error: 'Registro de variação não encontrado.' });
      }

      const now = new Date().toISOString();
      const status = acao === 'ignorar' ? 'ignorado' : 'resolvido';
      const acaoTomada = acao === 'ignorar' 
        ? 'Mantido preço de venda atual' 
        : `Aprovado novo preço de venda: R$ ${Number(novoPreco || item.preco_venda_sugerido).toFixed(2)}`;

      db.prepare(`
        UPDATE mural_variacao_precos
        SET status = ?,
            novo_preco_aplicado = ?,
            acao_tomada = ?,
            resolvido_por = ?,
            resolvido_em = ?
        WHERE id = ?
      `).run(
        status,
        acao === 'ignorar' ? item.preco_venda_atual : Number(novoPreco || item.preco_venda_sugerido),
        acaoTomada + (observacao ? ` (${observacao})` : ''),
        resolvidoPor || 'Administrador',
        now,
        id
      );

      // Registrar no log geral do sistema
      try {
        db.prepare(`
          INSERT INTO logs (id, timestamp, userName, userId, action, category, details)
          VALUES (?, ?, ?, ?, 'reprecificacao_produto', 'Mural ADM', ?)
        `).run(
          `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          now,
          resolvidoPor || 'Administrador',
          'adm',
          `Produto: ${item.descricao} (Cód: ${item.produto_id}) - ${acaoTomada}`
        );
      } catch (logErr) {}

      res.json({
        success: true,
        message: 'Decisão de reprecificação registrada com sucesso!'
      });
    } catch (err) {
      console.error('[Mural API] Erro em /price-variations/resolve:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 7. POST /api/mural/price-variations/sync
  // Dispara sincronização sob demanda das notas de entrada
  router.post('/price-variations/sync', async (req, res) => {
    try {
      const dias = parseInt(req.body.dias) || 15;
      const result = await sincronizarVariacaoPrecosMural(dias);
      res.json({ success: true, result });
    } catch (err) {
      console.error('[Mural API] Erro em /price-variations/sync:', err);
      res.status(500).json({ error: err.message });
    }
  });

  return {
    router,
    gerarDistribuicaoDiaria
  };
};
