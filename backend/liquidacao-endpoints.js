const express = require('express');
const { queryDigifarma } = require('./services/digifarma.service');

function formatarDataFirebird(date, isEnd = false) {
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

function getUltimoDiaMesQueVem() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = agora.getMonth(); // 0 = Jan, 8 = Set, etc.
  const ultimoDia = new Date(ano, mes + 2, 0); // Dia 0 do segundo mês à frente dá o último dia do próximo mês
  const yyyy = ultimoDia.getFullYear();
  const mm = String(ultimoDia.getMonth() + 1).padStart(2, '0');
  const dd = String(ultimoDia.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

module.exports = function (db) {
  const router = express.Router();

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

  // 1. GET /api/liquidacao/resumo
  // Retorna termômetro da dívida, meta semanal e progresso da seleção
  router.get('/resumo', (req, res) => {
    try {
      const campanha = getOrCreateCampanhaAtiva();

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

      // Total já vendido de itens em promoção (estimado com base nas saídas ou fechamentos)
      const resgatadoCampanha = db.prepare(`
        SELECT COALESCE(SUM(preco_promocional * 1), 0) as valor
        FROM liquidacao_campanhas_itens
        WHERE campanha_id = ? AND status = 'ativo'
      `).get(campanha.id).valor;

      const DIVIDA_INICIAL_CHEQUE = 3500.00;
      const totalResgatadoGeral = campanha.total_resgatado || 0;
      const saldoRestanteDivida = Math.max(0, DIVIDA_INICIAL_CHEQUE - totalResgatadoGeral);

      res.json({
        dividaInicial: DIVIDA_INICIAL_CHEQUE,
        saldoRestanteDivida,
        percentualDividaPaga: Math.min(100, Math.round((totalResgatadoGeral / DIVIDA_INICIAL_CHEQUE) * 100)),
        campanha: {
          id: campanha.id,
          semana: campanha.semana_ano,
          dataInicio: campanha.data_inicio,
          dataFim: campanha.data_fim,
          metaSemanal: campanha.meta_semanal || 450.00,
          totalResgatado: campanha.total_resgatado || 0,
          percentualMetaSemanal: Math.min(100, Math.round(((campanha.total_resgatado || 0) / (campanha.meta_semanal || 450.00)) * 100))
        },
        progressoSelecao: {
          aprovados,
          meta: 20,
          completo: false, // Sem trava: o usuário pode liquidar o máximo possível
          pulados
        }
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

      // Datas padrão de vigência: Início hoje, Término no último dia do mês que vem
      const hoje = new Date();
      const terminoStr = getUltimoDiaMesQueVem();

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
      const descontoPct = precoNormal > 0 ? Math.round(((precoNormal - prPromo) / precoNormal) * 100) : 0;

      // 1. Tenta gravar no Digifarma Firebird
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

      // 2. Grava na tabela de itens da campanha
      const itemId = 'liq_' + pId + '_' + Date.now();
      db.prepare(`
        INSERT OR REPLACE INTO liquidacao_campanhas_itens (
          id, campanha_id, produto_id, descricao, apresentacao, ean, categoria,
          saldo_estoque, preco_custo, preco_normal, preco_promocional, desconto_percentual,
          data_inicio, data_termino, status, sincronizado_digifarma, aprovado_por
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, 'ativo', ?, ?
        )
      `).run(
        itemId, campanha.id, pId, cacheProd.descricao, cacheProd.apresentacao || '', cacheProd.cod_barras || '', String(cacheProd.categoria || 'Geral'),
        Number(cacheProd.saldo) || 0, precoCusto, precoNormal, prPromo, descontoPct,
        data_inicio, data_termino, firebirdOk ? 1 : 0, aprovado_por || 'Edevaldo Cruz'
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

  // 5. GET /api/liquidacao/itens-ativos
  // Retorna os produtos que já estão com promoção ativa na campanha
  router.get('/itens-ativos', (req, res) => {
    try {
      const campanha = getOrCreateCampanhaAtiva();
      const itens = db.prepare(`
        SELECT * FROM liquidacao_campanhas_itens 
        WHERE campanha_id = ? AND status = 'ativo'
        ORDER BY aprovado_em DESC
      `).all(campanha.id);

      res.json({
        campanhaId: campanha.id,
        total: itens.length,
        itens
      });
    } catch (err) {
      console.error('[Liquidação API] Erro em /itens-ativos:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 6. POST /api/liquidacao/reverter
  // Reverte e encerra a promoção de um produto no Digifarma
  router.post('/reverter', async (req, res) => {
    try {
      const { produto_id, itemId } = req.body;
      const pId = Number(produto_id);

      // Reverte no Firebird
      let fbOk = false;
      try {
        await queryDigifarma(
          `UPDATE PRODUTOS 
           SET PROD_PRPROMOCAO = 0, 
               INICIO_PROMOCAO = NULL, 
               TERMINO_PROMOCAO = NULL 
           WHERE PRODUTO_ID = ?`,
          [pId]
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

      // Zera nos caches
      try {
        db.prepare("UPDATE compras_estoque_cache SET preco_promocional = 0 WHERE produto_id = ?").run(pId);
      } catch (e) {}

      res.json({ success: true, message: 'Promoção revertida no Digifarma e sistema!', firebirdSincronizado: fbOk });
    } catch (err) {
      console.error('[Liquidação API] Erro em /reverter:', err);
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

  return router;
};
