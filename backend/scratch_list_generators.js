const { queryDigifarma } = require('./services/digifarma.service');

async function run() {
  console.log("1. Fetching next PRODUTO_ID from generator...");
  try {
    const resId = await queryDigifarma("SELECT GEN_ID(GEN_PRODUTOS, 1) as NEW_ID FROM RDB$DATABASE");
    const newId = resId[0].NEW_ID;
    console.log("Next ID:", newId);

    const testBarcode = '9999999999999';
    const testName = 'PRODUTO TESTE ANTIGRAVITY';

    console.log("2. Inserting test product...");
    const insertSql = `
      INSERT INTO PRODUTOS (
        PRODUTO_ID, PRODUTO, COD_BARRAS, PROD_PRVENDA, PROD_SALDO, 
        PROD_ATIVO, CATEGORIA_ID, TRIBUTACAO_ID, PADRAO_COMISSAO_ID, 
        PROD_UNIDADE, TIPO_PRECO
      ) VALUES (
        ?, ?, ?, 9.99, 0, 
        'S', 5, 1, 2, 
        'UND', 'M'
      )
    `;
    await queryDigifarma(insertSql, [newId, testName, testBarcode]);
    console.log("Inserted successfully!");

    console.log("3. Querying inserted product...");
    const check = await queryDigifarma("SELECT * FROM PRODUTOS WHERE PRODUTO_ID = ?", [newId]);
    console.log("Found product:", JSON.stringify(check, null, 2));

    console.log("4. Cleaning up (deleting test product)...");
    await queryDigifarma("DELETE FROM PRODUTOS WHERE PRODUTO_ID = ?", [newId]);
    console.log("Cleaned up successfully!");

  } catch (err) {
    console.error("Test failed:", err.message);
  }
}

run().catch(console.error);
