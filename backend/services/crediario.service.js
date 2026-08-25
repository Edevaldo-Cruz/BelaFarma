const { queryDigifarma } = require('./digifarma.service');
const db = require('../database');

/**
 * Lista crediário ativo (Lê do cache SQLite ultra-rápido com fallback para Firebird)
 */
async function listarCrediarioAtivo() {
  try {
    const rows = db.prepare(`
      SELECT 
        id,
        cliente_id as clientId,
        cliente_nome as clientName,
        telefone as phone,
        valor as amount,
        data_compra as purchaseDate,
        data_vencimento as dueDate,
        venda_nota_id as saleId
      FROM digifarma_crediario_cache
      ORDER BY data_vencimento ASC
    `).all();

    if (rows && rows.length > 0) {
      return rows.map(r => ({
        id: r.id,
        clientId: r.clientId,
        clientName: r.clientName || 'Desconhecido',
        phone: r.phone || '',
        amount: r.amount,
        paidAmount: 0,
        balance: r.amount,
        purchaseDate: r.purchaseDate,
        dueDate: r.dueDate,
        saleId: r.saleId
      }));
    }
  } catch (dbErr) {
    console.warn('[Crediario Service] Cache SQLite indisponível, consultando Firebird:', dbErr.message);
  }

  // Fallback para Firebird se o cache estiver vazio
  const sql = `
    SELECT 
      c.FICHARIO_ID as id,
      c.CLIENTE_ID as clientId,
      cli.CLIENTE as clientName,
      cli.CLI_CELULAR as phone,
      c.FICHARIO_VALOR as amount,
      c.FICHARIO_DATACOMPRA as purchaseDate,
      c.FICHARIO_VENCIMENTO as dueDate,
      c.VENDA_NOTA_ID as saleId
    FROM FICHARIO c
    LEFT JOIN CLIENTES cli ON c.CLIENTE_ID = cli.CLIENTE_ID
    ORDER BY c.FICHARIO_VENCIMENTO ASC
  `;
  const result = await queryDigifarma(sql);
  
  return result.map(r => ({
    id: String(r.ID),
    clientId: r.CLIENTID,
    clientName: r.CLIENTNAME ? r.CLIENTNAME.trim() : 'Desconhecido',
    phone: r.PHONE ? r.PHONE.trim() : '',
    amount: r.AMOUNT,
    paidAmount: 0,
    balance: r.AMOUNT,
    purchaseDate: r.PURCHASEDATE,
    dueDate: r.DUEDATE,
    saleId: r.SALEID
  }));
}

/**
 * Recebe/baixa crediário: apaga no Firebird e remove do cache local no mesmo instante
 */
async function receberCrediario(crediarioId, valorPago) {
  const sql = `
    DELETE FROM FICHARIO 
    WHERE FICHARIO_ID = ?
  `;
  await queryDigifarma(sql, [crediarioId]);

  // Remove do cache SQLite local imediatamente
  try {
    db.prepare('DELETE FROM digifarma_crediario_cache WHERE id = ?').run(String(crediarioId));
  } catch (e) {}

  return { success: true, message: 'Baixa realizada com sucesso no Digifarma e no cache local!' };
}

/**
 * Lista crediário criado hoje
 */
async function listarCrediarioDoDia(businessDayStart) {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const rows = db.prepare(`
      SELECT 
        id,
        cliente_id as clientId,
        cliente_nome as clientName,
        valor as amount,
        data_compra as purchaseDate
      FROM digifarma_crediario_cache
      WHERE data_compra LIKE ?
      ORDER BY data_compra DESC
    `).all(`${todayStr}%`);

    if (rows && rows.length > 0) {
      return rows.map(r => ({
        id: String(r.id),
        client: r.clientName || 'Cliente Digifarma',
        val: Number(r.amount) || 0,
        purchaseDate: r.purchaseDate
      }));
    }
  } catch (e) {}

  // Fallback para Firebird
  const sql = `
    SELECT 
      c.FICHARIO_ID as id,
      c.CLIENTE_ID as clientId,
      cli.CLIENTE as clientName,
      c.FICHARIO_VALOR as amount,
      c.FICHARIO_DATACOMPRA as purchaseDate
    FROM FICHARIO c
    LEFT JOIN CLIENTES cli ON c.CLIENTE_ID = cli.CLIENTE_ID
    WHERE CAST(c.FICHARIO_DATACOMPRA AS DATE) >= CURRENT_DATE
    ORDER BY c.FICHARIO_DATACOMPRA DESC
  `;
  const result = await queryDigifarma(sql);
  
  return result.map(r => {
    const idVal = r.ID !== undefined ? r.ID : r.id;
    const clientVal = r.CLIENTNAME || r.clientName || r.CLIENTE || r.cliente;
    const amountVal = r.AMOUNT !== undefined ? r.AMOUNT : r.amount;
    const dateVal = r.PURCHASEDATE || r.purchaseDate;
    
    return {
      id: String(idVal || Date.now()),
      client: clientVal ? String(clientVal).trim() : 'Cliente Digifarma',
      val: Number(amountVal) || 0,
      purchaseDate: dateVal
    };
  });
}

module.exports = {
  listarCrediarioAtivo,
  listarCrediarioDoDia,
  receberCrediario
};
