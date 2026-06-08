const { queryDigifarma } = require('./services/digifarma.service.js');
const sql = "SELECT FIRST 1 * FROM CAB_NOTAS";
const sql2 = "SELECT FIRST 1 * FROM ITEM_NOTAS";

async function run() {
  try {
    const r1 = await queryDigifarma(sql);
    console.log("CAB_NOTAS:", Object.keys(r1[0] || {}));
    const r2 = await queryDigifarma(sql2);
    console.log("ITEM_NOTAS:", Object.keys(r2[0] || {}));
  } catch(e) { console.error(e) }
}
run();
