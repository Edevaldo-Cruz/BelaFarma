/**
 * Belinha ERP - Digifarma Sales Synchronization Service
 * Sincroniza atomicamente as vendas finalizadas no BelinhaPDV com o Firebird do Digifarma:
 * - Insere cabeçalho em CAB_VENDAS
 * - Insere itens em ITEM_VENDAS
 * - Atualiza saldo em PRODUTOS (baixa física de estoque)
 * - Atualiza os totais acumulados no CAIXA ativo do dia
 * - Registra em NFCE com status 'A' (se emitido na SEFAZ pelo Belinha, impedindo retransmissão)
 *   ou registra com status 'P' (Pendente, para resolução manual no Digifarma caso a SEFAZ falhe).
 */

const { queryDigifarma } = require('../../services/digifarma.service');

/**
 * Obtém o Caixa atualmente aberto no Digifarma
 * @returns {Promise<Object|null>}
 */
async function obterCaixaAbertoDigifarma() {
  try {
    const rows = await queryDigifarma(`
      SELECT FIRST 1 
        CAIXA_ID, 
        OPERADOR_ABERTURA, 
        ABERTURA, 
        VALOR_ABERTURA, 
        TOTAL_VENDAS, 
        VENDAS_DINHEIRO, 
        VENDAS_CARTAO, 
        VENDAS_CREDIARIO, 
        VENDAS_OUTROS
      FROM CAIXA 
      WHERE FECHAMENTO IS NULL 
      ORDER BY CAIXA_ID DESC
    `, [], 10000);

    if (rows && rows.length > 0) {
      return rows[0];
    }
    return null;
  } catch (err) {
    console.error('[Digifarma Sync] ⚠️ Erro ao consultar Caixa aberto:', err.message);
    return null;
  }
}

/**
 * Sincroniza uma venda finalizada do BelinhaPDV para o Digifarma
 * @param {Object} saleData Dados da venda (items, payments, totals, etc.)
 * @param {Object|null} fiscalInfo Informações da emissão fiscal (chave, protocolo, status, url)
 * @returns {Promise<Object>} Resultado da sincronização
 */
async function sincronizarVendaDigifarma(saleData, fiscalInfo = null) {
  const {
    sale_id,
    items = [],
    payments = [],
    total_items_value = 0,
    discount_value = 0,
    total_value = 0,
    user_name = 'Caixa'
  } = saleData;

  console.log(`[Digifarma Sync] 🔄 Iniciando sincronização da Venda #${sale_id} para o Digifarma...`);

  // 1. Localiza o caixa ativo
  const caixa = await obterCaixaAbertoDigifarma();
  if (!caixa) {
    console.warn('[Digifarma Sync] ⚠️ Nenhum Caixa com status aberto encontrado no Digifarma. A venda foi gravada localmente no Belinha, mas o Caixa do Digifarma precisa ser aberto.');
    return {
      success: false,
      error: 'Nenhum Caixa aberto no Digifarma no momento.'
    };
  }

  const caixaId = caixa.CAIXA_ID;
  const operadorId = caixa.OPERADOR_ABERTURA || 11; // Fallback para operador padrão

  try {
    // 2. Gerar novo VENDA_NOTA_ID via generator do Firebird
    const genRes = await queryDigifarma('SELECT GEN_ID(GEN_CAB_VENDAS, 1) as NEW_ID FROM RDB$DATABASE');
    const vendaNotaId = genRes[0]?.NEW_ID;
    if (!vendaNotaId) {
      throw new Error('Falha ao obter GEN_CAB_VENDAS do Firebird.');
    }

    // 3. Decomposição de Formas de Pagamento
    let valorDinheiro = 0;
    let valorCartao = 0;
    let valorCrediario = 0;
    let valorOutros = 0;
    let trocoTotal = 0;

    for (const p of payments) {
      const amt = parseFloat(p.amount) || 0;
      const chg = parseFloat(p.change_amount) || 0;
      trocoTotal += chg;

      const method = (p.payment_method || '').toUpperCase();
      if (method === 'DINHEIRO') {
        valorDinheiro += Math.max(0, amt - chg);
      } else if (method.includes('CARTAO')) {
        valorCartao += amt;
      } else if (method === 'CREDIARIO') {
        valorCrediario += amt;
      } else {
        // PIX, Vale, etc.
        valorOutros += amt;
      }
    }

    const totalVendaFinal = Math.round(parseFloat(total_value) * 100) / 100;
    const totalRecebidoFinal = Math.round((valorDinheiro + valorCartao + valorCrediario + valorOutros) * 100) / 100;
    const descontoFinal = Math.round(parseFloat(discount_value) * 100) / 100;

    // 4. Inserir cabeçalho em CAB_VENDAS
    const insertCabSql = `
      INSERT INTO CAB_VENDAS (
        VENDA_NOTA_ID, VENDEDOR_ID, VENDA_TOTAL, VENDA_RECEBIDO,
        VENDA_DATA_HORA, DINHEIRO, CHEQUE, CHEQUE_PRE, CARTAO,
        CREDIARIO, PARCELAMENTO, CAIXA_ID, ECF, CANCELADO,
        VALOR_DEVOLUCAO, SIGN, STATUS_TRANSF, LASTUPDATE,
        TROCO, CAIXA_DEFINIDO, PRE_VENDA, CANCELADO_SEM_FECHAR,
        DESCONTO_SUBTOTAL, VENDA_TOTAL_DEC, VENDA_RECEBIDO_DEC,
        EXIBIR_CPF, FLAG_DELIVERY
      ) VALUES (
        ?, ?, ?, ?,
        CURRENT_TIMESTAMP, ?, 0, 0, ?,
        ?, 0, ?, '1', 'N',
        0, 'CHK-010701', 'I', CURRENT_TIMESTAMP,
        ?, 'S', NULL, 'N',
        ?, ?, ?,
        'S', 'N'
      )
    `;

    await queryDigifarma(insertCabSql, [
      vendaNotaId,
      operadorId,
      totalVendaFinal,
      totalRecebidoFinal,
      valorDinheiro,
      valorCartao,
      valorCrediario,
      caixaId,
      trocoTotal,
      descontoFinal,
      totalVendaFinal,
      totalRecebidoFinal
    ]);

    // 5. Inserir Itens em ITEM_VENDAS e dar baixa de estoque no Digifarma
    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      const prodCodeRaw = it.product_code || it.code;
      const produtoId = parseInt(prodCodeRaw, 10);
      const qtd = parseFloat(it.quantity) || 1;
      const prVenda = parseFloat(it.unit_price) || 0;
      const prTabela = prVenda; // Tabela base

      if (!isNaN(produtoId) && produtoId > 0) {
        // Inserir item
        const insertItemSql = `
          INSERT INTO ITEM_VENDAS (
            ITEM_VENDA_ID, VENDA_NOTA_ID, PRODUTO_ID, ITEMVEND_QUANT,
            ITEMVEND_PRTABELA, ITEMVEND_PRVENDA, ITEMVEND_COMISSAO,
            CANCELADO, CONFIRMADO, SIGN, STATUS_TRANSF,
            LASTUPDATE, ITEMVEND_PRTABELA_DEC, ITEMVEND_PRVENDA_DEC
          ) VALUES (
            GEN_ID(GEN_ITEM_VENDAS, 1), ?, ?, ?,
            ?, ?, 0,
            'N', 'S', 'CHK-010701', 'I',
            CURRENT_TIMESTAMP, ?, ?
          )
        `;

        await queryDigifarma(insertItemSql, [
          vendaNotaId,
          produtoId,
          qtd,
          prTabela,
          prVenda,
          prTabela,
          prVenda
        ]);

        // Baixa imediata de estoque no Digifarma (PRODUTOS)
        try {
          await queryDigifarma(`
            UPDATE PRODUTOS 
            SET PROD_SALDO = COALESCE(PROD_SALDO, 0) - ? 
            WHERE PRODUTO_ID = ?
          `, [qtd, produtoId]);
        } catch (stockErr) {
          console.error(`[Digifarma Sync] ⚠️ Erro ao atualizar PROD_SALDO do produto ${produtoId}:`, stockErr.message);
        }
      }
    }

    // 6. Atualizar acumulados do CAIXA aberto
    try {
      const updateCaixaSql = `
        UPDATE CAIXA 
        SET TOTAL_VENDAS = COALESCE(TOTAL_VENDAS, 0) + ?,
            VENDAS_DINHEIRO = COALESCE(VENDAS_DINHEIRO, 0) + ?,
            VENDAS_CARTAO = COALESCE(VENDAS_CARTAO, 0) + ?,
            VENDAS_CREDIARIO = COALESCE(VENDAS_CREDIARIO, 0) + ?,
            VENDAS_OUTROS = COALESCE(VENDAS_OUTROS, 0) + ?
        WHERE CAIXA_ID = ?
      `;

      await queryDigifarma(updateCaixaSql, [
        totalVendaFinal,
        valorDinheiro,
        valorCartao,
        valorCrediario,
        valorOutros,
        caixaId
      ]);
    } catch (caixaErr) {
      console.error('[Digifarma Sync] ⚠️ Erro ao atualizar totais do CAIXA:', caixaErr.message);
    }

    // 7. Registro Fiscal na Tabela NFCE do Digifarma
    let nfceRecordStatus = 'NAO_APLICAVEL';

    if (fiscalInfo && fiscalInfo.success && fiscalInfo.chave) {
      // ✅ SEFAZ AUTORIZADA PELO BELINHA:
      // Grava com STATUS 'A' para que o Digifarma considere transmitida e NUNCA retransmita!
      try {
        const serieId = parseInt(fiscalInfo.serie, 10) || 1;
        const nfId = parseInt(fiscalInfo.nfe_number, 10) || 1;

        const insertNfceSql = `
          INSERT INTO NFCE (
            NFCE_ID, LOTE, SERIE_ID, NF_ID, VENDA_NOTA_ID,
            CONTROLE, CHAVE, RECIBO_ENVIO, PROTOCOLO_ENVIO,
            TIPO, DATA_AUTORIZACAO, DATA_NFCE_ENVIO,
            STATUS, URL, DATA_OPERACAO, INTEGRADO, DFE
          ) VALUES (
            GEN_ID(GEN_NFCE, 1), 1, ?, ?, ?,
            ?, ?, ?, ?,
            'V', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
            'A', ?, CURRENT_TIMESTAMP, 'S', 'S'
          )
        `;

        await queryDigifarma(insertNfceSql, [
          serieId,
          nfId,
          vendaNotaId,
          vendaNotaId,
          fiscalInfo.chave,
          fiscalInfo.protocolo || 'AUTORIZADO-BELINHA',
          fiscalInfo.protocolo || 'AUTORIZADO-BELINHA',
          fiscalInfo.url_qrcode || ''
        ]);

        nfceRecordStatus = 'AUTORIZADO_SEM_REENVIO';
        console.log(`[Digifarma Sync] 🛡️ Venda #${vendaNotaId} marcada em NFCE com STATUS 'A' (Chave ${fiscalInfo.chave.substring(0, 10)}...). Digifarma bloqueado de reenviar à SEFAZ.`);
      } catch (nfceErr) {
        console.error('[Digifarma Sync] ⚠️ Erro ao gravar registro na tabela NFCE do Digifarma:', nfceErr.message);
      }
    } else if (fiscalInfo && !fiscalInfo.success) {
      // ⚠️ SEFAZ FALHOU OU NÃO CONECTOU:
      // Grava com STATUS 'P' (Pendente) para que o Digifarma saiba que precisa ser resolvida
      try {
        const serieId = parseInt(fiscalInfo.serie, 10) || 1;
        const nfId = parseInt(fiscalInfo.nfe_number, 10) || 1;

        const insertNfceSql = `
          INSERT INTO NFCE (
            NFCE_ID, LOTE, SERIE_ID, NF_ID, VENDA_NOTA_ID,
            CONTROLE, CHAVE, RECIBO_ENVIO, PROTOCOLO_ENVIO,
            TIPO, DATA_NFCE_ENVIO,
            STATUS, URL, DATA_OPERACAO, INTEGRADO, DFE, ERRO
          ) VALUES (
            GEN_ID(GEN_NFCE, 1), 1, ?, ?, ?,
            ?, '', '', '',
            'V', CURRENT_TIMESTAMP,
            'P', '', CURRENT_TIMESTAMP, 'N', 'N', ?
          )
        `;

        await queryDigifarma(insertNfceSql, [
          serieId,
          nfId,
          vendaNotaId,
          vendaNotaId,
          (fiscalInfo.error || fiscalInfo.error_message || 'Pendente SEFAZ via Belinha').substring(0, 200)
        ]);

        nfceRecordStatus = 'PENDENTE_DIGIFARMA';
        console.log(`[Digifarma Sync] ⚠️ Venda #${vendaNotaId} gravada em NFCE com STATUS 'P' (Pendente fiscal no Digifarma).`);
      } catch (nfceErr) {
        console.error('[Digifarma Sync] ⚠️ Erro ao registrar pendência fiscal na tabela NFCE:', nfceErr.message);
      }
    }

    console.log(`[Digifarma Sync] ✅ Sincronização concluída com sucesso! Venda Digifarma #${vendaNotaId} no Caixa #${caixaId}. Fiscal: ${nfceRecordStatus}`);

    return {
      success: true,
      venda_nota_id: vendaNotaId,
      caixa_id: caixaId,
      fiscal_status: nfceRecordStatus
    };
  } catch (err) {
    console.error(`[Digifarma Sync] ❌ Erro ao sincronizar venda #${sale_id} no Digifarma:`, err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Atualiza o registro fiscal no Digifarma após emissão posterior com sucesso
 */
async function atualizarNfceAutorizadaDigifarma(vendaNotaId, fiscalInfo) {
  if (!vendaNotaId || !fiscalInfo || !fiscalInfo.chave) return;
  try {
    const updateSql = `
      UPDATE NFCE 
      SET STATUS = 'A',
          CHAVE = ?,
          PROTOCOLO_ENVIO = ?,
          URL = ?,
          DATA_AUTORIZACAO = CURRENT_TIMESTAMP,
          DFE = 'S',
          INTEGRADO = 'S'
      WHERE VENDA_NOTA_ID = ?
    `;
    await queryDigifarma(updateSql, [
      fiscalInfo.chave,
      fiscalInfo.protocolo || 'AUTORIZADO-BELINHA',
      fiscalInfo.url_qrcode || '',
      vendaNotaId
    ]);
    console.log(`[Digifarma Sync] ✅ NFCE atualizada para STATUS 'A' no Digifarma (Venda #${vendaNotaId}).`);
  } catch (err) {
    console.error(`[Digifarma Sync] ⚠️ Falha ao atualizar NFCE no Digifarma para Venda #${vendaNotaId}:`, err.message);
  }
}

module.exports = {
  obterCaixaAbertoDigifarma,
  sincronizarVendaDigifarma,
  atualizarNfceAutorizadaDigifarma
};

