const firebird = require('node-firebird');
const { queryDigifarma } = require('./services/digifarma.service');

(async () => {
    try {
        console.log("=== Colunas VIEW_ULT_COMPRAS ===");
        const cols1 = await queryDigifarma("SELECT RDB$FIELD_NAME FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'VIEW_ULT_COMPRAS'");
        console.log(cols1);

        console.log("=== Colunas FORNECEDORES ===");
        const cols2 = await queryDigifarma("SELECT RDB$FIELD_NAME FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = 'FORNECEDORES'");
        console.log(cols2);

    } catch (e) {
        console.error(e);
    }
    process.exit(0);
})();
