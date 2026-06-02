const { queryDigifarma } = require('./digifarma.service');

async function listarCrediarioAtivo() {
  const sql = \`
    SELECT 
      c.CREDIARIO_ID as id,
      c.CLIENTE_ID as clientId,
      cli.CLIENTE as clientName,
      cli.CLI_CELULAR as phone,
      c.CREDIARIO_VALOR as amount,
      c.CREDIARIO_CREDITO as paidAmount,
      c.CREDIARIO_VENCIMENTO as dueDate,
      c.VENDA_NOTA_ID as saleId
    FROM CREDIARIO c
    LEFT JOIN CLIENTES cli ON c.CLIENTE_ID = cli.CLIENTE_ID
    WHERE (c.CREDIARIO_VALOR - COALESCE(c.CREDIARIO_CREDITO, 0)) > 0
    ORDER BY c.CREDIARIO_VENCIMENTO ASC
  \`;
  const result = await queryDigifarma(sql);
  
  return result.map(r => ({
    id: r.ID,
    clientId: r.CLIENTID,
    clientName: r.CLIENTNAME ? r.CLIENTNAME.trim() : 'Desconhecido',
    phone: r.PHONE ? r.PHONE.trim() : '',
    amount: r.AMOUNT,
    paidAmount: r.PAIDAMOUNT || 0,
    balance: r.AMOUNT - (r.PAIDAMOUNT || 0),
    dueDate: r.DUEDATE,
    saleId: r.SALEID
  }));
}

async function receberCrediario(crediarioId, valorPago) {
  // ATENÇÃO: Essa é uma operação crítica. No Digifarma, o recebimento de crediário
  // geralmente atualiza o CREDIARIO_CREDITO ou insere na CAIXA_RECEB_FPAGTOS.
  // Para simplicidade e segurança sem quebrar a integridade referencial:
  // Vamos atualizar o CREDIARIO_CREDITO.
  const sql = \`
    UPDATE CREDIARIO 
    SET CREDIARIO_CREDITO = COALESCE(CREDIARIO_CREDITO, 0) + ? 
    WHERE CREDIARIO_ID = ?
  \`;
  await queryDigifarma(sql, [valorPago, crediarioId]);
  return { success: true, message: 'Baixa realizada com sucesso no Digifarma' };
}

module.exports = {
  listarCrediarioAtivo,
  receberCrediario
};
