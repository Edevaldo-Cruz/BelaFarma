const { queryDigifarma } = require('./services/digifarma.service.js');

async function run() {
  try {
    const q1 = "SELECT FIRST 5 PRODUTO, PROD_SALDO FROM PRODUTOS WHERE PROD_SALDO > 0";
    const rows = await queryDigifarma(q1);
    console.log("Samples:", rows);
  } catch (err) {
    console.error(err);
  }
}
run();
