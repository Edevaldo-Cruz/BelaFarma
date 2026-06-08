const { queryDigifarma } = require('./services/digifarma.service');
(async () => {
    try {
        const cols = await queryDigifarma("SELECT RDB$FIELD_NAME FROM RDB$RELATION_FIELDS WHERE TRIM(RDB$RELATION_NAME) = 'FORNECEDORES'");
        console.log("Cols:", cols.map(c => c['RDB$FIELD_NAME'].trim()));
    } catch (e) {
        console.error("Error:", e);
    }
    process.exit(0);
})();
