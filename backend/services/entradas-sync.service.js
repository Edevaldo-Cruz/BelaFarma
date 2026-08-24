const { queryDigifarma } = require('./digifarma.service');
const db = require('../database');
const crypto = require('crypto');

/**
 * Formata número para 2 casas decimais
 */
function round2(val) {
  return Math.round((Number(val) || 0) * 100) / 100;
}

/**
 * Busca histórico da compra imediatamente anterior à data de emissão informada
 */
async function buscarCompraAnterior(produtoId, dataEmissaoRef, cabNotaIdAtual) {
  try {
    const dataRef = dataEmissaoRef 
      ? (dataEmissaoRef instanceof Date ? dataEmissaoRef.toISOString().replace('T', ' ').substring(0, 19) : String(dataEmissaoRef).replace('T', ' ').substring(0, 19))
      : new Date().toISOString().replace('T', ' ').substring(0, 19);

    const sql = `
      SELECT FIRST 1
        c.CAB_NOTA_ID,
        c.DATA_EMISSAO,
        c.NOTA_FISCAL,
        f.FORNECEDOR,
        i.ITEM_NOTAS_QUANT,
        i.ITEM_NOTAS_PRCOMPRA
      FROM ITEM_NOTAS i
      JOIN CAB_NOTAS c ON i.CAB_NOTA_ID = c.CAB_NOTA_ID
      LEFT JOIN FORNECEDORES f ON c.FORNECEDOR_ID = f.FORNECEDOR_ID
      WHERE i.PRODUTO_ID = ? 
        AND c.ENTRADA_SAIDA = 'E' 
        AND c.CANCELAMENTO = 'N'
        AND c.CAB_NOTA_ID <> ?
        AND c.DATA_EMISSAO <= ?
      ORDER BY c.DATA_EMISSAO DESC, c.CAB_NOTA_ID DESC
    `;
    const res = await queryDigifarma(sql, [produtoId, cabNotaIdAtual, dataRef]);
    if (res && res.length > 0) {
      return {
        cabNotaId: res[0].CAB_NOTA_ID,
        dataEmissao: res[0].DATA_EMISSAO,
        notaFiscal: res[0].NOTA_FISCAL,
        fornecedor: res[0].FORNECEDOR,
        quantidade: res[0].ITEM_NOTAS_QUANT || 0,
        precoCompra: Number(res[0].ITEM_NOTAS_PRCOMPRA) || 0
      };
    }
    return null;
  } catch (err) {
    console.error(`[EntradasSync] Erro ao buscar compra anterior (Prod ID: ${produtoId}):`, err.message);
    return null;
  }
}

/**
 * Busca notas fiscais de entrada e seus itens enriquecidos com comparativo de custos e cruzamento de faltas
 */
async function buscarRelatorioEntradas({ dias = 30, dataInicio, dataFim, notaFiscal, limit = 50 } = {}) {
  try {
    let where = "c.ENTRADA_SAIDA = 'E' AND c.CANCELAMENTO = 'N'";
    const params = [];

    if (notaFiscal) {
      where += " AND c.NOTA_FISCAL LIKE ?";
      params.push(`%${notaFiscal.trim()}%`);
    } else if (dataInicio && dataFim) {
      where += " AND CAST(c.DATA_EMISSAO AS DATE) BETWEEN ? AND ?";
      params.push(dataInicio, dataFim);
    } else {
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() - parseInt(dias, 10));
      const dataStr = dataLimite.toISOString().split('T')[0] + ' 00:00:00';
      where += " AND c.DATA_EMISSAO >= ?";
      params.push(dataStr);
    }

    const sqlCab = `
      SELECT FIRST ${limit}
        c.CAB_NOTA_ID,
        c.NOTA_FISCAL,
        c.DATA_EMISSAO,
        c.FORNECEDOR_ID,
        f.FORNECEDOR,
        COALESCE(c.VALOR_TOTAL, c.VALOR_TOTAL_DEC, 0) as TOTAL_NOTA
      FROM CAB_NOTAS c
      LEFT JOIN FORNECEDORES f ON c.FORNECEDOR_ID = f.FORNECEDOR_ID
      WHERE ${where}
      ORDER BY c.DATA_EMISSAO DESC
    `;

    const notasCab = await queryDigifarma(sqlCab, params);
    if (!notasCab || notasCab.length === 0) {
      return { success: true, notas: [], totalNotas: 0, totalFaltasAtendidas: 0 };
    }

    // Carregar a lista de faltas não compradas do banco local para cruzamento
    const faltasPendentes = db.prepare(`
      SELECT id, productName, type, clientInquiry, notes, createdAt, userName
      FROM shortages 
      WHERE purchased = 0
    `).all();

    const faltasMap = new Map();
    faltasPendentes.forEach(f => {
      if (f.productName) {
        const cleanName = f.productName.trim().toUpperCase();
        if (!faltasMap.has(cleanName)) {
          faltasMap.set(cleanName, []);
        }
        faltasMap.get(cleanName).push(f);
      }
    });

    const notasResultado = [];
    let contadorFaltasGeral = 0;

    for (const nota of notasCab) {
      const sqlItens = `
        SELECT 
          i.ITEM_NOTA_ID,
          i.CAB_NOTA_ID,
          i.PRODUTO_ID,
          p.PRODUTO,
          p.APRESENTACAO,
          p.COD_BARRAS,
          p.PROD_PRVENDA,
          i.ITEM_NOTAS_QUANT,
          i.ITEM_NOTAS_PRCOMPRA
        FROM ITEM_NOTAS i
        JOIN PRODUTOS p ON i.PRODUTO_ID = p.PRODUTO_ID
        WHERE i.CAB_NOTA_ID = ?
        ORDER BY p.PRODUTO ASC
      `;

      const itens = await queryDigifarma(sqlItens, [nota.CAB_NOTA_ID]);
      const itensDetalhados = [];
      let totalFaltasNaNota = 0;

      for (const item of (itens || [])) {
        const custoAtual = round2(item.ITEM_NOTAS_PRCOMPRA);
        const precoVendaAtual = round2(item.PROD_PRVENDA);
        const produtoNome = (item.PRODUTO || '').trim();
        const produtoNomeUpper = produtoNome.toUpperCase();

        // Buscar compra anterior
        const compraAnterior = await buscarCompraAnterior(item.PRODUTO_ID, nota.DATA_EMISSAO, nota.CAB_NOTA_ID);
        const custoAnterior = compraAnterior ? round2(compraAnterior.precoCompra) : 0;

        let variacaoReais = 0;
        let variacaoPercentual = 0;
        let variacaoTipo = 'estavel'; // 'aumento', 'reducao', 'estavel', 'primeira_compra'

        if (custoAnterior > 0) {
          variacaoReais = round2(custoAtual - custoAnterior);
          variacaoPercentual = round2(((custoAtual - custoAnterior) / custoAnterior) * 100);
          if (variacaoReais > 0.009) {
            variacaoTipo = 'aumento';
          } else if (variacaoReais < -0.009) {
            variacaoTipo = 'reducao';
          } else {
            variacaoTipo = 'estavel';
          }
        } else {
          variacaoTipo = 'primeira_compra';
        }

        // Cálculo da margem e preço de venda sugerido
        let margemAtual = 0;
        let precoVendaSugerido = precoVendaAtual;

        if (precoVendaAtual > 0) {
          const baseCusto = custoAnterior > 0 ? custoAnterior : custoAtual;
          margemAtual = round2(((precoVendaAtual - baseCusto) / precoVendaAtual) * 100);

          if (custoAnterior > 0 && precoVendaAtual > custoAnterior) {
            // Mantém a margem de lucro % bruta exata anterior
            const margemFracao = (precoVendaAtual - custoAnterior) / precoVendaAtual;
            if (margemFracao < 0.99) {
              precoVendaSugerido = round2(custoAtual / (1 - margemFracao));
            } else {
              precoVendaSugerido = round2(custoAtual * (precoVendaAtual / custoAnterior));
            }
          } else if (variacaoPercentual !== 0) {
            precoVendaSugerido = round2(precoVendaAtual * (1 + variacaoPercentual / 100));
          }
        } else if (custoAtual > 0) {
          precoVendaSugerido = round2(custoAtual * 1.5); // Fallback padrão 50%
        }

        // Margem nova se mantiver o preço de venda atual com o novo custo
        const margemNovaSeManter = precoVendaAtual > 0 ? round2(((precoVendaAtual - custoAtual) / precoVendaAtual) * 100) : 0;

        // Cruzar com Lista de Faltas
        let faltaCorrespondente = null;
        if (faltasMap.has(produtoNomeUpper)) {
          const faltas = faltasMap.get(produtoNomeUpper);
          if (faltas && faltas.length > 0) {
            faltaCorrespondente = faltas[0];
            totalFaltasNaNota++;
            contadorFaltasGeral++;
          }
        } else {
          // Busca parcial por prefixo
          for (const [nomeFalta, lista] of faltasMap.entries()) {
            if (nomeFalta.length > 4 && (produtoNomeUpper.includes(nomeFalta) || nomeFalta.includes(produtoNomeUpper))) {
              faltaCorrespondente = lista[0];
              totalFaltasNaNota++;
              contadorFaltasGeral++;
              break;
            }
          }
        }

        itensDetalhados.push({
          itemId: item.ITEM_NOTAS_ID,
          produtoId: item.PRODUTO_ID,
          descricao: produtoNome,
          apresentacao: (item.APRESENTACAO || '').trim(),
          codBarras: (item.COD_BARRAS || '').trim(),
          quantidade: item.ITEM_NOTAS_QUANT || 0,
          custoAtual,
          custoAnterior,
          variacaoReais,
          variacaoPercentual,
          variacaoTipo,
          precoVendaAtual,
          precoVendaSugerido,
          margemAtual,
          margemNovaSeManter,
          compraAnteriorDetalhes: compraAnterior ? {
            data: compraAnterior.dataEmissao,
            nf: compraAnterior.notaFiscal,
            fornecedor: compraAnterior.fornecedor,
            preco: compraAnterior.precoCompra
          } : null,
          faltaId: faltaCorrespondente ? faltaCorrespondente.id : null,
          faltaInfo: faltaCorrespondente || null
        });
      }

      notasResultado.push({
        cabNotaId: nota.CAB_NOTA_ID,
        notaFiscal: (nota.NOTA_FISCAL || '').trim(),
        dataEmissao: nota.DATA_EMISSAO,
        fornecedorId: nota.FORNECEDOR_ID,
        fornecedor: (nota.FORNECEDOR || 'Fornecedor Desconhecido').trim(),
        totalNota: Number(nota.TOTAL_NOTA) || 0,
        totalItens: itensDetalhados.length,
        totalFaltasAtendidas: totalFaltasNaNota,
        itens: itensDetalhados
      });
    }

    return {
      success: true,
      notas: notasResultado,
      totalNotas: notasResultado.length,
      totalFaltasAtendidas: contadorFaltasGeral
    };
  } catch (err) {
    console.error('[EntradasSync] Erro ao buscar relatório de entradas:', err);
    throw err;
  }
}

/**
 * Sincroniza variações de preço de entradas recentes para o Mural de Pendências dos Administradores
 */
async function sincronizarVariacaoPrecosMural(dias = 7) {
  try {
    console.log(`[EntradasSync] Analisando entradas dos últimos ${dias} dias para o Mural de Variações...`);
    const relatorio = await buscarRelatorioEntradas({ dias, limit: 30 });
    if (!relatorio.notas || relatorio.notas.length === 0) {
      return { totalNovasPendencias: 0 };
    }

    let insertCount = 0;
    const insertStmt = db.prepare(`
      INSERT INTO mural_variacao_precos (
        id, produto_id, descricao, cod_barras, apresentacao, custo_anterior, custo_novo,
        variacao_percentual, preco_venda_atual, preco_venda_sugerido, margem_atual,
        margem_nova_se_manter, fornecedor, nota_fiscal, data_entrada, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente')
    `);

    const checkStmt = db.prepare(`
      SELECT id FROM mural_variacao_precos 
      WHERE produto_id = ? AND nota_fiscal = ?
    `);

    db.transaction(() => {
      for (const nota of relatorio.notas) {
        for (const item of nota.itens) {
          // Variações reais significativas (aumento ou redução)
          if (item.variacaoTipo === 'aumento' || item.variacaoTipo === 'reducao') {
            const jaExiste = checkStmt.get(item.produtoId, nota.notaFiscal);
            if (!jaExiste) {
              const id = `mvp_${Date.now()}_${item.produtoId}_${Math.random().toString(36).substring(2, 6)}`;
              insertStmt.run(
                id,
                item.produtoId,
                item.descricao,
                item.codBarras,
                item.apresentacao,
                item.custoAnterior,
                item.custoAtual,
                item.variacaoPercentual,
                item.precoVendaAtual,
                item.precoVendaSugerido,
                item.margemAtual,
                item.margemNovaSeManter,
                nota.fornecedor,
                nota.notaFiscal,
                nota.dataEmissao ? new Date(nota.dataEmissao).toISOString() : new Date().toISOString()
              );
              insertCount++;
            }
          }
        }
      }
    })();

    console.log(`[EntradasSync] ✅ Sincronização concluída: ${insertCount} novas pendências de variação geradas.`);
    return { totalNovasPendencias: insertCount };
  } catch (err) {
    console.error('[EntradasSync] Erro ao sincronizar variações para o mural:', err.message);
    return { totalNovasPendencias: 0, error: err.message };
  }
}

/**
 * Dá baixa em lote em produtos da lista de faltas
 */
function darBaixaFaltas(shortageIds, userName = 'Administrador', details = 'Baixa automática via Relatório de Entradas') {
  if (!shortageIds || !Array.isArray(shortageIds) || shortageIds.length === 0) {
    return { success: false, message: 'Nenhum ID de falta fornecido.' };
  }

  try {
    const updateStmt = db.prepare('UPDATE shortages SET purchased = 1 WHERE id = ?');
    const logStmt = db.prepare(`
      INSERT INTO logs (id, timestamp, userName, userId, action, category, details)
      VALUES (?, ?, ?, ?, 'baixa_falta_entrada', 'Compras / Estoque', ?)
    `);

    const now = new Date().toISOString();
    let updatedCount = 0;

    db.transaction(() => {
      for (const id of shortageIds) {
        const res = updateStmt.run(id);
        if (res.changes > 0) {
          updatedCount++;
          logStmt.run(
            `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            now,
            userName,
            'sistema',
            `Falta baixada por entrada de nota fiscal (ID: ${id}) - ${details}`
          );
        }
      }
    })();

    return {
      success: true,
      updatedCount,
      message: `${updatedCount} produto(s) marcado(s) como comprado(s) com sucesso.`
    };
  } catch (err) {
    console.error('[EntradasSync] Erro ao dar baixa em faltas:', err);
    throw err;
  }
}

module.exports = {
  buscarRelatorioEntradas,
  sincronizarVariacaoPrecosMural,
  darBaixaFaltas
};
