const {queryDigifarma} = require('./services/digifarma.service');
async function run() {
  const sql = "SELECT RDB$RELATION_NAME, RDB$FIELD_NAME FROM RDB$RELATION_FIELDS WHERE RDB$FIELD_NAME LIKE '%CRED%' OR RDB$FIELD_NAME LIKE '%VENC%' OR RDB$FIELD_NAME LIKE '%DIV%' OR RDB$FIELD_NAME LIKE '%DEB%'";
  const fields = await queryDigifarma(sql);
  console.log(fields.map(x => x['RDB$RELATION_NAME'].trim() + '.' + x['RDB$FIELD_NAME'].trim()).join('\\n'));
}
run().catch(console.error);
