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
        EXIBIR_CPF, FLAG_DELIVERY, DATA_ENCERRAMENTO, CARTAO_FECHADO,
        CANCELADO_CUPOM, OUTROS, SUBSIDIO, SUBSIDIO_ASSEFAZ,
        VALOR_DESCONTO_CANCELADO, PARCELAS_CARTAO, FRETE
      ) VALUES (
        ?, ?, ?, ?,
        CURRENT_TIMESTAMP, ?, 0, 0, ?,
        ?, 0, ?, '1', 'N',
        0, 'CHK-010701', 'I', CURRENT_TIMESTAMP,
        ?, 'S', NULL, 'N',
        ?, ?, ?,
        'S', 'N', CURRENT_TIMESTAMP, 'S',
        'N', ?, 0, 0,
        0, 1, 0
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
      totalRecebidoFinal,
      valorOutros
    ]);

    // 4.1 Inserir Formas de Pagamento em CAB_VENDAS_FPAGTOS
    // TIPO_PAGAMENTO_ID: 1=Dinheiro, 2=Cheque, 3=ChequePré, 4=Cartão, 5=Crediário, 6=Parcelamento, 8=Pix
    for (let pIdx = 0; pIdx < payments.length; pIdx++) {
      const p = payments[pIdx];
      const amt = parseFloat(p.amount) || 0;
      const chg = parseFloat(p.change_amount) || 0;
      const netAmt = Math.round(Math.max(0, amt - chg) * 100) / 100;
      if (netAmt <= 0) continue;

      const method = (p.payment_method || '').toUpperCase();
      let tipoPagtoId = 1; // DINHEIRO padrão
      let bandeira = null;

      if (method.includes('CARTAO') || method.includes('CARTÃO') || method.includes('DEBITO') || method.includes('CREDITO')) {
        tipoPagtoId = 4;
        bandeira = (p.card_brand || (method.includes('DEBITO') ? 'DEBITO' : 'CREDITO')).substring(0, 20);
      } else if (method.includes('CREDIARIO') || method.includes('CONVENIO') || method.includes('CONVÊNIO')) {
        tipoPagtoId = 5;
      } else if (method.includes('PIX')) {
        tipoPagtoId = 8;
      }

      try {
        const insertFpSql = `
          INSERT INTO CAB_VENDAS_FPAGTOS (
            CAB_VENDAS_FPAGTO_ID, TIPO_PAGAMENTO_ID, VENDA_NOTA_ID, ORDEM_ID, BANDEIRA, VALOR, VALOR_CANCELADO
          ) VALUES (
            GEN_ID(GEN_CAB_VENDAS_FPAGTOS, 1), ?, ?, ?, ?, ?, 0
          )
        `;
        await queryDigifarma(insertFpSql, [
          tipoPagtoId,
          vendaNotaId,
          pIdx + 1,
          bandeira,
          netAmt
        ]);
      } catch (fpErr) {
        console.warn(`[Digifarma Sync] ⚠️ Falha ao inserir FPAGTO (${method}):`, fpErr.message);
      }
    }

    // 5. Inserir Itens em ITEM_VENDAS e dar baixa de estoque no Digifarma
    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx];
      const prodCodeRaw = it.product_code || it.code;
      const produtoId = parseInt(prodCodeRaw, 10);
      const qtd = parseFloat(it.quantity) || 1;
      const prVenda = parseFloat(it.unit_price) || 0;
      const prTabela = prVenda; // Tabela base

      if (!isNaN(produtoId) && produtoId > 0) {
        // Inserir item com ITEM_VENDA_ID sequencial (1, 2, 3...) igual ao padrão nativo do Digifarma
        const insertItemSql = `
          INSERT INTO ITEM_VENDAS (
            ITEM_VENDA_ID, VENDA_NOTA_ID, PRODUTO_ID, ITEMVEND_QUANT,
            ITEMVEND_PRTABELA, ITEMVEND_PRVENDA, ITEMVEND_COMISSAO,
            CANCELADO, CONFIRMADO, SIGN, STATUS_TRANSF,
            LASTUPDATE, ITEMVEND_PRTABELA_DEC, ITEMVEND_PRVENDA_DEC,
            VENDEDOR_ID, PAGAR_COMISSAO, DATA_COMISSAO,
            ITEMVEND_CANCELADO_CUPOM, SUBSIDIO, SUBSIDIO_ASSEFAZ,
            ITEMVEND_FRETE, VENDA_INTELIGENTE, ORIGEM_PRECO_ID,
            INDICADOR, ITEMVEND_DESCONTO_DEC, ITEMVEND_SUBSIDIO_DEC,
            ITEMVEND_FRETE_TOTAL, COD_TRIBUTACAO
          ) VALUES (
            ?, ?, ?, ?,
            ?, ?, 0,
            'N', 'S', 'CHK-010701', 'I',
            CURRENT_TIMESTAMP, ?, ?,
            ?, 'S', CURRENT_TIMESTAMP,
            'N', 0, 0,
            0, 'N', 2,
            0, 0, 0,
            0, 'F'
          )
        `;

        await queryDigifarma(insertItemSql, [
          idx + 1,
          vendaNotaId,
          produtoId,
          qtd,
          prTabela,
          prVenda,
          prTabela,
          prVenda,
          operadorId
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

    if (fiscalInfo) {
      let serieId = parseInt(fiscalInfo.serie, 10) || 1;
      let nfId = parseInt(fiscalInfo.nfe_number, 10) || 0;

      // Se o número não veio ou veio <= 1, obtém sempre o último número registrado no Digifarma + 1
      if (nfId <= 1) {
        try {
          const maxRows = await queryDigifarma(`
            SELECT 
              COALESCE((SELECT FIRST 1 SERIE_ID FROM SERIE_NF WHERE TIPO_NF = 'NFCE'), 1) AS SERIE_OFICIAL,
              COALESCE((SELECT MAX(NF_ID) FROM SERIE_NF WHERE TIPO_NF = 'NFCE'), 0) AS MAX_SERIE_NF,
              COALESCE((SELECT MAX(NF_ID) FROM NFCE WHERE SERIE_ID = 1), 0) AS MAX_NFCE
            FROM RDB$DATABASE
          `, [], 3000);
          if (maxRows && maxRows.length > 0) {
            serieId = parseInt(maxRows[0].SERIE_OFICIAL, 10) || 1;
            const ultimo = Math.max(
              parseInt(maxRows[0].MAX_SERIE_NF, 10) || 0,
              parseInt(maxRows[0].MAX_NFCE, 10) || 0
            );
            nfId = ultimo + 1;
          }
        } catch (maxErr) {
          console.warn('[Digifarma Sync] ⚠️ Erro ao consultar último NF_ID no Digifarma:', maxErr.message);
        }
      }

      // Atualiza SERIE_NF no Digifarma para manter o sequencial sincronizado com o caixa físico
      if (nfId > 1) {
        try {
          await queryDigifarma(`
            UPDATE SERIE_NF 
            SET NF_ID = CASE WHEN COALESCE(NF_ID, 0) < ? THEN ? ELSE NF_ID END,
                DATA_ULT_VENDA = CURRENT_TIMESTAMP
            WHERE TIPO_NF = 'NFCE' AND SERIE_ID = ?
          `, [nfId, nfId, serieId]);
        } catch (sErr) {
          console.warn('[Digifarma Sync] ⚠️ Aviso ao atualizar SERIE_NF:', sErr.message);
        }
      }

      if (fiscalInfo.chave) {
        const isContingency = fiscalInfo.status === 'CONTINGENCIA' || fiscalInfo.contingency === true;
        const statusNfce = isContingency ? 'P' : 'A';
        const protocoloEnvio = fiscalInfo.protocolo || (isContingency ? 'CONTINGENCIA-OFFLINE' : 'AUTORIZADO-BELINHA');

        try {
          const insertNfceSql = `
            INSERT INTO NFCE (
              NFCE_ID, LOTE, SERIE_ID, NF_ID, VENDA_NOTA_ID,
              CONTROLE, CHAVE, RECIBO_ENVIO, PROTOCOLO_ENVIO,
              TIPO, DATA_AUTORIZACAO, DATA_NFCE_ENVIO,
              STATUS, URL, DATA_OPERACAO, INTEGRADO, DFE,
              MOTIVO_CANC, TOKEN, TENT_ENVIO, AMBIENTE
            ) VALUES (
              GEN_ID(GEN_NFCE, 1), 1, ?, ?, ?,
              ?, ?, ?, ?,
              'V', ${isContingency ? 'NULL' : 'CURRENT_TIMESTAMP'}, CURRENT_TIMESTAMP,
              ?, ?, CURRENT_TIMESTAMP, NULL, NULL,
              '', '', 0, 'P'
            )
          `;

          await queryDigifarma(insertNfceSql, [
            serieId,
            nfId,
            vendaNotaId,
            vendaNotaId,
            fiscalInfo.chave,
            protocoloEnvio,
            protocoloEnvio,
            statusNfce,
            fiscalInfo.url_qrcode || fiscalInfo.url || ''
          ]);

          nfceRecordStatus = isContingency ? 'CONTINGENCIA_OFFLINE' : 'AUTORIZADO_SEM_REENVIO';
          console.log(`[Digifarma Sync] 🛡️ Venda #${vendaNotaId} registrada em NFCE com STATUS '${statusNfce}' (Chave: ${fiscalInfo.chave.substring(0, 15)}..., Série: ${serieId}, NF: #${nfId}).`);
        } catch (nfceErr) {
          console.error('[Digifarma Sync] ⚠️ Erro ao gravar registro na tabela NFCE do Digifarma:', nfceErr.message);
        }
      } else if (!fiscalInfo.success && !fiscalInfo.non_fiscal) {
        // ⚠️ SEFAZ FALHOU OU NÃO CONECTOU SEM CHAVE:
        // Grava com STATUS 'P' (Pendente) e o NF_ID sequencial real (nunca 1)
        try {
          const insertNfceSql = `
            INSERT INTO NFCE (
              NFCE_ID, LOTE, SERIE_ID, NF_ID, VENDA_NOTA_ID,
              CONTROLE, CHAVE, RECIBO_ENVIO, PROTOCOLO_ENVIO,
              TIPO, DATA_NFCE_ENVIO,
              STATUS, URL, DATA_OPERACAO, INTEGRADO, DFE, ERRO,
              MOTIVO_CANC, TOKEN, TENT_ENVIO, AMBIENTE
            ) VALUES (
              GEN_ID(GEN_NFCE, 1), 1, ?, ?, ?,
              ?, '', '', '',
              'V', CURRENT_TIMESTAMP,
              'P', '', CURRENT_TIMESTAMP, 'N', 'N', ?,
              '', '', 0, 'P'
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
          console.log(`[Digifarma Sync] ⚠️ Venda #${vendaNotaId} gravada em NFCE com STATUS 'P' e NF #${nfId}.`);
        } catch (nfceErr) {
          console.error('[Digifarma Sync] ⚠️ Erro ao gravar NFCE pendente:', nfceErr.message);
        }
      }
    }

    console.log(`[Digifarma Sync] ✅ Sincronização concluída com sucesso! Venda Digifarma #${vendaNotaId} no Caixa #${caixaId}. Fiscal: ${nfceRecordStatus}`);

    // Atualiza status no banco local SQLite
    try {
      const { db } = require('./erp-database');
      db.prepare(`
        UPDATE sales 
        SET digifarma_sync_status = 'SINCRONIZADO',
            digifarma_venda_id = ?,
            digifarma_sync_at = datetime('now', 'localtime'),
            digifarma_sync_error = NULL
        WHERE id = ?
      `).run(vendaNotaId, sale_id);
    } catch (dbErr) {}

    return {
      success: true,
      venda_nota_id: vendaNotaId,
      caixa_id: caixaId,
      fiscal_status: nfceRecordStatus
    };
  } catch (err) {
    console.error(`[Digifarma Sync] ❌ Erro ao sincronizar venda #${sale_id} no Digifarma:`, err.message);

    // Grava status de ERRO / PENDENTE no banco local para reprocessamento posterior
    try {
      const { db } = require('./erp-database');
      db.prepare(`
        UPDATE sales 
        SET digifarma_sync_status = 'ERRO',
            digifarma_sync_error = ?
        WHERE id = ?
      `).run((err.message || 'Erro de sincronização').substring(0, 255), sale_id);
    } catch (dbErr) {}

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

/**
 * Fila Resiliente: Reprocessa vendas pendentes ou com erro para o Digifarma
 */
async function reprocessarVendasPendentesDigifarma() {
  const { db } = require('./erp-database');
  const pendentes = db.prepare(`
    SELECT * FROM sales 
    WHERE (digifarma_sync_status IN ('PENDENTE', 'ERRO') OR digifarma_sync_status IS NULL)
      AND status = 'CONCLUIDA'
    ORDER BY created_at ASC
    LIMIT 20
  `).all();

  if (!pendentes || pendentes.length === 0) {
    return { success: true, count: 0, message: 'Nenhuma venda pendente para sincronizar no Digifarma.' };
  }

  console.log(`[Digifarma Sync] 🔄 Reprocessando ${pendentes.length} venda(s) pendente(s) para o Digifarma...`);
  let sucessos = 0;
  let falhas = 0;

  for (const s of pendentes) {
    try {
      const items = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(s.id);
      const payments = db.prepare('SELECT * FROM sale_payments WHERE sale_id = ?').all(s.id);

      const fiscalInfo = s.fiscal_status === 'AUTORIZADA' ? {
        success: true,
        chave: s.access_key,
        nfe_number: s.nfe_number,
        serie: s.nfe_series || 1,
        protocolo: s.protocol_number,
        url_qrcode: s.qr_code_url
      } : null;

      const res = await sincronizarVendaDigifarma({
        sale_id: s.id,
        items,
        payments,
        total_items_value: s.total_items_value,
        discount_value: s.discount_value,
        total_value: s.total_value,
        user_name: s.user_name || s.seller_name || 'Caixa'
      }, fiscalInfo);

      if (res && res.success) {
        sucessos++;
      } else {
        falhas++;
      }
    } catch (syncErr) {
      falhas++;
      console.warn(`[Digifarma Sync] ⚠️ Falha ao reprocessar venda ${s.id}:`, syncErr.message);
    }
  }

  return {
    success: true,
    total: pendentes.length,
    sucessos,
    falhas
  };
}

/**
 * Sincroniza Sangria ou Suprimento diretamente no CAIXA ativo do Digifarma
 * @param {Object} mov Dados da movimentação { id, movement_type, amount, reason, user_name }
 * @returns {Promise<Object>}
 */
async function sincronizarMovimentacaoCaixaDigifarma(mov) {
  const { movement_type, amount } = mov;
  const numAmount = Math.round(parseFloat(amount) * 100) / 100;

  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('Valor da movimentação inválido.');
  }

  const tipo = String(movement_type).toUpperCase();
  if (tipo !== 'SANGRIA' && tipo !== 'SUPRIMENTO') {
    throw new Error('Tipo de movimentação inválido (deve ser SANGRIA ou SUPRIMENTO).');
  }

  const caixa = await obterCaixaAbertoDigifarma();
  if (!caixa) {
    return {
      success: false,
      error: 'Nenhum Caixa aberto encontrado no Digifarma.'
    };
  }

  const caixaId = caixa.CAIXA_ID;
  const col = tipo === 'SANGRIA' ? 'SANGRIA' : 'SUPRIMENTO';

  try {
    const sql = `UPDATE CAIXA SET ${col} = COALESCE(${col}, 0) + ? WHERE CAIXA_ID = ?`;
    await queryDigifarma(sql, [numAmount, caixaId]);

    console.log(`[Digifarma Sync] 💵 ${tipo} de R$ ${numAmount.toFixed(2)} aplicada com sucesso ao Caixa #${caixaId} no Digifarma!`);
    return {
      success: true,
      caixa_id: caixaId,
      tipo,
      amount: numAmount
    };
  } catch (err) {
    console.error(`[Digifarma Sync] ⚠️ Erro ao aplicar ${tipo} no Caixa #${caixaId}:`, err.message);
    return {
      success: false,
      caixa_id: caixaId,
      error: err.message
    };
  }
}

/**
 * Estorna atomicamente uma venda no Firebird do Digifarma:
 * - Marca CAB_VENDAS.CANCELADO = 'S'
 * - Marca ITEM_VENDAS.CANCELADO = 'S'
 * - Devolve as quantidades ao estoque físico em PRODUTOS.PROD_SALDO
 * - Subtrai os valores faturados da tabela CAIXA
 * - Marca NFCE.STATUS = 'C' (Cancelado)
 * @param {number|string} digifarmaVendaId ID da venda no Firebird (VENDA_NOTA_ID)
 * @param {string} motivo Justificativa do estorno
 * @returns {Promise<Object>}
 */
async function estornarVendaDigifarma(digifarmaVendaId, motivo = '') {
  const vId = parseInt(digifarmaVendaId, 10);
  if (isNaN(vId) || vId <= 0) {
    console.warn('[Digifarma Estorno] ⚠️ ID da venda no Digifarma não informado ou inválido.');
    return { success: false, error: 'ID de venda Digifarma inválido.' };
  }

  console.log(`[Digifarma Estorno] ↩️ Iniciando estorno atômico da Venda #${vId} no Digifarma...`);

  try {
    // 1. Obter dados da venda gravada no Firebird
    const cabRows = await queryDigifarma(`
      SELECT VENDA_NOTA_ID, VENDA_TOTAL, DINHEIRO, CARTAO, CREDIARIO, CAIXA_ID, CANCELADO 
      FROM CAB_VENDAS 
      WHERE VENDA_NOTA_ID = ?
    `, [vId], 10000);

    if (!cabRows || cabRows.length === 0) {
      console.warn(`[Digifarma Estorno] ⚠️ Venda #${vId} não encontrada na CAB_VENDAS do Firebird.`);
      return { success: false, error: `Venda #${vId} não encontrada no Digifarma.` };
    }

    const cab = cabRows[0];
    if (cab.CANCELADO === 'S') {
      console.log(`[Digifarma Estorno] ℹ️ Venda #${vId} já consta como cancelada no Digifarma.`);
      return { success: true, already_cancelled: true };
    }

    // 2. Marcar CAB_VENDAS como cancelada
    await queryDigifarma(`
      UPDATE CAB_VENDAS 
      SET CANCELADO = 'S',
          CANCELADO_CUPOM = 'S',
          VALOR_DEVOLUCAO = VENDA_TOTAL,
          LASTUPDATE = CURRENT_TIMESTAMP
      WHERE VENDA_NOTA_ID = ?
    `, [vId], 10000);

    // 3. Obter itens para estornar estoque em PRODUTOS
    const itemRows = await queryDigifarma(`
      SELECT PRODUTO_ID, ITEMVEND_QUANT 
      FROM ITEM_VENDAS 
      WHERE VENDA_NOTA_ID = ?
    `, [vId], 10000);

    if (itemRows && itemRows.length > 0) {
      for (const item of itemRows) {
        const prodId = parseInt(item.PRODUTO_ID, 10);
        const qtd = parseFloat(item.ITEMVEND_QUANT) || 0;

        if (prodId > 0 && qtd > 0) {
          try {
            await queryDigifarma(`
              UPDATE PRODUTOS 
              SET PROD_SALDO = COALESCE(PROD_SALDO, 0) + ? 
              WHERE PRODUTO_ID = ?
            `, [qtd, prodId], 10000);
          } catch (stkErr) {
            console.error(`[Digifarma Estorno] ⚠️ Erro ao estornar saldo do produto ${prodId}:`, stkErr.message);
          }
        }
      }

      // Marcar itens como cancelados
      await queryDigifarma(`
        UPDATE ITEM_VENDAS 
        SET CANCELADO = 'S',
            ITEMVEND_CANCELADO_CUPOM = 'S',
            DATA_CANCELAMENTO = CURRENT_TIMESTAMP,
            LASTUPDATE = CURRENT_TIMESTAMP
        WHERE VENDA_NOTA_ID = ?
      `, [vId], 10000);
    }

    // 4. Estornar valores acumulados no CAIXA do Digifarma
    if (cab.CAIXA_ID) {
      const vTotal = parseFloat(cab.VENDA_TOTAL) || 0;
      const vDin = parseFloat(cab.DINHEIRO) || 0;
      const vCard = parseFloat(cab.CARTAO) || 0;
      const vCred = parseFloat(cab.CREDIARIO) || 0;

      try {
        await queryDigifarma(`
          UPDATE CAIXA 
          SET TOTAL_VENDAS = CASE WHEN TOTAL_VENDAS >= ? THEN TOTAL_VENDAS - ? ELSE 0 END,
              VENDAS_DINHEIRO = CASE WHEN VENDAS_DINHEIRO >= ? THEN VENDAS_DINHEIRO - ? ELSE 0 END,
              VENDAS_CARTAO = CASE WHEN VENDAS_CARTAO >= ? THEN VENDAS_CARTAO - ? ELSE 0 END,
              VENDAS_CREDIARIO = CASE WHEN VENDAS_CREDIARIO >= ? THEN VENDAS_CREDIARIO - ? ELSE 0 END
          WHERE CAIXA_ID = ?
        `, [
          vTotal, vTotal,
          vDin, vDin,
          vCard, vCard,
          vCred, vCred,
          cab.CAIXA_ID
        ], 10000);
      } catch (cxErr) {
        console.error(`[Digifarma Estorno] ⚠️ Erro ao estornar acumulados do Caixa #${cab.CAIXA_ID}:`, cxErr.message);
      }
    }

    // 5. Atualizar status na tabela NFCE
    try {
      await queryDigifarma(`
        UPDATE NFCE 
        SET STATUS = 'C',
            MOTIVO_CANC = ?,
            DATA_NFCE_CANC = CURRENT_TIMESTAMP,
            DATA_OPERACAO = CURRENT_TIMESTAMP
        WHERE VENDA_NOTA_ID = ?
      `, [String(motivo || 'Cancelamento no PDV').substring(0, 100), vId], 10000);
    } catch (nfceErr) {
      console.warn(`[Digifarma Estorno] ⚠️ Aviso ao atualizar tabela NFCE para cancelado:`, nfceErr.message);
    }

    console.log(`[Digifarma Estorno] ✅ Venda #${vId} totalmente estornada no Firebird (Estoque + Caixa + Status).`);
    return {
      success: true,
      venda_nota_id: vId,
      items_restocked: itemRows?.length || 0
    };

  } catch (err) {
    console.error(`[Digifarma Estorno] ⚠️ Erro crítico no estorno da Venda #${vId}:`, err.message);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Estorna/Cancela individualmente um item de uma venda no Digifarma
 * - Marca ITEM_VENDAS.CANCELADO = 'S'
 * - Restaura estoque em PRODUTOS.PROD_SALDO += quantidade
 * - Incrementa CAB_VENDAS.VALOR_DEVOLUCAO += valor_item
 * - Se todos os itens da venda forem cancelados, marca CAB_VENDAS.CANCELADO = 'S'
 */
async function estornarItemVendaDigifarma({
  digifarmaVendaId,
  produtoId,
  quantidade = 1,
  valorItem = 0,
  digifarmaItemId = null
}) {
  const vId = parseInt(digifarmaVendaId, 10);
  const pId = parseInt(produtoId, 10);
  const qtd = parseFloat(quantidade) || 1;
  const val = parseFloat(valorItem) || 0;

  if (isNaN(vId) || vId <= 0) {
    return { success: false, error: 'ID de venda Digifarma inválido.' };
  }

  console.log(`[Digifarma Estorno Item] ↩️ Estornando Produto #${pId} (Qtd: ${qtd}, R$ ${val.toFixed(2)}) da Venda #${vId}...`);

  try {
    // 1. Localiza o item em ITEM_VENDAS
    let itemCondition = "VENDA_NOTA_ID = ? AND (CANCELADO IS NULL OR CANCELADO <> 'S')";
    const params = [vId];

    if (digifarmaItemId) {
      itemCondition += ' AND ITEM_VENDA_ID = ?';
      params.push(parseInt(digifarmaItemId, 10));
    } else if (pId > 0) {
      itemCondition += ' AND PRODUTO_ID = ?';
      params.push(pId);
    }

    const itemRows = await queryDigifarma(`
      SELECT FIRST 1 ITEM_VENDA_ID, VENDA_NOTA_ID, PRODUTO_ID, ITEMVEND_QUANT, ITEMVEND_PRVENDA, CANCELADO
      FROM ITEM_VENDAS
      WHERE ${itemCondition}
    `, params, 10000);

    if (itemRows && itemRows.length > 0) {
      const it = itemRows[0];
      await queryDigifarma(`
        UPDATE ITEM_VENDAS
        SET CANCELADO = 'S'
        WHERE ITEM_VENDA_ID = ? AND VENDA_NOTA_ID = ?
      `, [it.ITEM_VENDA_ID, vId], 10000);

      await queryDigifarma(`
        UPDATE PRODUTOS
        SET PROD_SALDO = COALESCE(PROD_SALDO, 0) + ?
        WHERE PRODUTO_ID = ?
      `, [qtd, it.PRODUTO_ID], 10000);

      console.log(`[Digifarma Estorno Item] ✅ Estoque do produto #${it.PRODUTO_ID} devolvido (+${qtd}) e item marcado como CANCELADO.`);
    } else if (pId > 0) {
      await queryDigifarma(`
        UPDATE PRODUTOS
        SET PROD_SALDO = COALESCE(PROD_SALDO, 0) + ?
        WHERE PRODUTO_ID = ?
      `, [qtd, pId], 10000);
    }

    // 2. Atualiza CAB_VENDAS (VALOR_DEVOLUCAO)
    await queryDigifarma(`
      UPDATE CAB_VENDAS
      SET VALOR_DEVOLUCAO = COALESCE(VALOR_DEVOLUCAO, 0) + ?,
          LASTUPDATE = CURRENT_TIMESTAMP
      WHERE VENDA_NOTA_ID = ?
    `, [val, vId], 10000);

    // 3. Verifica se todos os itens da venda foram cancelados
    const ativosRestantes = await queryDigifarma(`
      SELECT COUNT(*) AS ATIVOS
      FROM ITEM_VENDAS
      WHERE VENDA_NOTA_ID = ? AND (CANCELADO IS NULL OR CANCELADO <> 'S')
    `, [vId], 10000);

    let vendaInteiraCancelada = false;
    if (ativosRestantes && ativosRestantes[0] && parseInt(ativosRestantes[0].ATIVOS, 10) === 0) {
      await queryDigifarma(`
        UPDATE CAB_VENDAS
        SET CANCELADO = 'S'
        WHERE VENDA_NOTA_ID = ?
      `, [vId], 10000);
      vendaInteiraCancelada = true;
      console.log(`[Digifarma Estorno Item] ℹ️ Todos os itens foram cancelados: Venda #${vId} marcada como cancelada.`);
    }

    return {
      success: true,
      venda_nota_id: vId,
      produto_id: pId,
      venda_inteira_cancelada: vendaInteiraCancelada
    };

  } catch (err) {
    console.error(`[Digifarma Estorno Item] ⚠️ Erro no estorno do item da Venda #${vId}:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  obterCaixaAbertoDigifarma,
  sincronizarVendaDigifarma,
  atualizarNfceAutorizadaDigifarma,
  reprocessarVendasPendentesDigifarma,
  sincronizarMovimentacaoCaixaDigifarma,
  estornarVendaDigifarma,
  estornarItemVendaDigifarma
};

