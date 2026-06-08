const { queryDigifarma } = require('./services/digifarma.service.js');
const sql = "SELECT RDB$VIEW_SOURCE FROM RDB$RELATIONS WHERE RDB$RELATION_NAME = 'VIEW_ULT_COMPRAS'";
queryDigifarma(sql).then(res => console.log(res)).catch(console.error);
