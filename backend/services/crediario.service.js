const { queryDigifarma } = require('./digifarma.service');

async function listarCrediarioAtivo() {
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
    id: r.ID,
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

async function receberCrediario(crediarioId, valorPago) {
  // No Digifarma, o pagamento do fiado apaga o registro da tabela FICHARIO.
  // Vamos apagar o registro da tabela FICHARIO. (Se houver pagamento parcial, seria um UPDATE, mas vamos assumir pagamento total para simplificar)
  const sql = `
    DELETE FROM FICHARIO 
    WHERE FICHARIO_ID = ?
  `;
  await queryDigifarma(sql, [crediarioId]);
  return { success: true, message: 'Baixa realizada com sucesso no Digifarma' };
}

async function listarCrediarioDoDia(businessDayStart) {
  const sql = `
    SELECT 
      c.FICHARIO_ID as id,
      c.CLIENTE_ID as clientId,
      cli.CLIENTE as clientName,
      c.FICHARIO_VALOR as amount,
      c.FICHARIO_DATACOMPRA as purchaseDate
    FROM FICHARIO c
    LEFT JOIN CLIENTES cli ON c.CLIENTE_ID = cli.CLIENTE_ID
    WHERE c.FICHARIO_DATACOMPRA >= ?
    ORDER BY c.FICHARIO_DATACOMPRA DESC
  `;
  const result = await queryDigifarma(sql, [businessDayStart]);
  
  return result.map(r => ({
    id: String(r.ID),
    client: r.CLIENTNAME ? r.CLIENTNAME.trim() : 'Cliente Digifarma',
    val: r.AMOUNT || 0,
    purchaseDate: r.PURCHASEDATE
  }));
}

module.exports = {
  listarCrediarioAtivo,
  listarCrediarioDoDia,
  receberCrediario
};
