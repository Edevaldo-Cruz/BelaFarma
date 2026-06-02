const {queryDigifarma} = require('./services/digifarma.service');
async function run() {
  const tables = await queryDigifarma("SELECT RDB$RELATION_NAME FROM RDB$RELATIONS WHERE RDB$SYSTEM_FLAG=0 AND RDB$VIEW_BLR IS NULL");
  console.log(tables.map(x => x['RDB$RELATION_NAME'].trim()).join(','));
}
run().catch(console.error);
