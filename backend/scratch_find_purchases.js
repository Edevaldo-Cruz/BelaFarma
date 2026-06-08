const firebird = require('node-firebird');
const { queryDigifarma } = require('./services/digifarma.service');

(async () => {
    try {
        console.log("=== Tabelas com COMPRA ou ENTRADA nas tabelas do Digifarma ===");
        const tables = await queryDigifarma(`
            SELECT RDB$RELATION_NAME 
            FROM RDB$RELATIONS 
            WHERE RDB$SYSTEM_FLAG=0 
              AND (RDB$RELATION_NAME LIKE '%COMPRA%' OR RDB$RELATION_NAME LIKE '%ENTRADA%' OR RDB$RELATION_NAME LIKE '%FORNEC%')
        `);
        console.log(tables);
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
})();
