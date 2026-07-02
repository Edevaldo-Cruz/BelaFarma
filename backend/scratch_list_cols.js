const { queryDigifarma } = require('./services/digifarma.service');

async function run() {
  try {
    const categories = await queryDigifarma("SELECT * FROM CATEGORIA");
    console.log("CATEGORIA rows:", JSON.stringify(categories, null, 2));
  } catch (e) {
    console.log("CATEGORIA query failed:", e.message);
  }

  try {
    const subCategories = await queryDigifarma("SELECT FIRST 20 * FROM SUB_CATEGORIAS");
    console.log("SUB_CATEGORIAS rows:", JSON.stringify(subCategories, null, 2));
  } catch (e) {
    console.log("SUB_CATEGORIAS query failed:", e.message);
  }
}

run().catch(console.error);
