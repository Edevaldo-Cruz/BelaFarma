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
          completo: aprovados >= 20,
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
  router.get('/proximo-item', (req, res) => {
    try {
      const campanha = getOrCreateCampanhaAtiva();

      // IDs já aprovados ou pulados nesta campanha
      const ignorarIdsRows = db.prepare(`
        SELECT produto_id FROM liquidacao_campanhas_itens WHERE status = 'ativo'
        UNION
        SELECT produto_id FROM liquidacao_itens_pulados WHERE campanha_id = ?
      `).all(campanha.id);
      const ignorarIds = new Set(ignorarIdsRows.map(r => Number(r.produto_id)));

      // 1ª Tentativa: Mural de produtos parados (> 90d)
      let candidatos = db.prepare(`
        SELECT 
          produto_id, descricao, cod_barras, apresentacao, categoria,
          saldo, preco_venda, preco_compra, valor_total_parado, dias_parado
        FROM mural_produtos_parados
        WHERE status = 'pendente' AND saldo > 0 AND preco_venda > 0
        ORDER BY valor_total_parado DESC, saldo DESC
        LIMIT 60
      `).all();

      let itemEscolhido = candidatos.find(c => !ignorarIds.has(Number(c.produto_id)));

      // 2ª Tentativa (fallback): Se não encontrou no mural, busca no compras_estoque_cache itens sem venda 90d
      if (!itemEscolhido) {
        const fallbackCandidatos = db.prepare(`
          SELECT 
            produto_id, descricao, ean as cod_barras, apresentacao, categoria_id as categoria,
            saldo, preco_normal as preco_venda, 
            COALESCE(NULLIF(custo_unitario, 0), NULLIF(ultima_compra_valor, 0), 0) as preco_compra,
            (saldo * preco_normal) as valor_total_parado,
            90 as dias_parado
          FROM compras_estoque_cache
          WHERE saldo > 0 
            AND preco_normal > 0
            AND (vendas_30d = 0 OR vendas_30d IS NULL)
            AND (vendas_31_60d = 0 OR vendas_31_60d IS NULL)
            AND (vendas_61_90d = 0 OR vendas_61_90d IS NULL)
          ORDER BY valor_total_parado DESC
          LIMIT 100
        `).all();

        itemEscolhido = fallbackCandidatos.find(c => !ignorarIds.has(Number(c.produto_id)));
      }

      if (!itemEscolhido) {
        return res.json({
          disponivel: false,
          mensagem: 'Nenhum outro produto parado há mais de 90 dias encontrado para liquidação no momento.'
        });
      }

      const pId = Number(itemEscolhido.produto_id);
      const precoVendaNormal = Number(itemEscolhido.preco_venda) || 0;
      let precoCusto = Number(itemEscolhido.preco_compra) || 0;

      // Se custo estiver zerado, tenta obter de digifarma_ultimas_compras_cache
      if (precoCusto <= 0) {
        const uc = db.prepare('SELECT preco_unitario_ult_compra FROM digifarma_ultimas_compras_cache WHERE produto_id = ?').get(pId);
        if (uc && Number(uc.preco_unitario_ult_compra) > 0) {
          precoCusto = Number(uc.preco_unitario_ult_compra);
        } else {
          // Fallback estimado: 60% do preço de venda
          precoCusto = Number((precoVendaNormal * 0.60).toFixed(2));
        }
      }

      // Regra aprovada pelo usuário: Preço de Custo + Simples (7%)
      const taxaSimples = 0.07;
      let precoSugerido = roundUpToAcceptedCents(precoCusto * (1 + taxaSimples));

      // Trava de segurança: se custo + 7% for >= preço normal, dá 20% sobre o preço normal
      if (precoSugerido >= precoVendaNormal) {
        precoSugerido = roundUpToAcceptedCents(precoVendaNormal * 0.80);
      }
      if (precoSugerido <= 0) {
        precoSugerido = roundUpToAcceptedCents(precoVendaNormal * 0.70);
      }

      const descontoReais = Math.max(0, precoVendaNormal - precoSugerido);
      const descontoPercentual = precoVendaNormal > 0 
        ? Math.round((descontoReais / precoVendaNormal) * 100) 
        : 0;

      // Datas padrão de vigência (7 dias a partir de hoje)
      const hoje = new Date();
      const termino = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000);

      res.json({
        disponivel: true,
        produto: {
          produto_id: pId,
          descricao: itemEscolhido.descricao,
          apresentacao: itemEscolhido.apresentacao || '',
          cod_barras: itemEscolhido.cod_barras || '',
          categoria: itemEscolhido.categoria || 'Geral',
          saldo: Number(itemEscolhido.saldo) || 0,
          preco_custo: precoCusto,
          preco_normal: precoVendaNormal,
          preco_sugerido: precoSugerido,
          desconto_reais: descontoReais,
          desconto_percentual: descontoPercentual,
          valor_total_parado: Number(itemEscolhido.valor_total_parado) || (Number(itemEscolhido.saldo) * precoVendaNormal),
          dias_parado: itemEscolhido.dias_parado || 90,
          vigencia_padrao: {
            data_inicio: hoje.toISOString().split('T')[0],
            data_termino: termino.toISOString().split('T')[0]
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
