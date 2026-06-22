const { queryDigifarma } = require('./services/digifarma.service.js');
queryDigifarma("SELECT FIRST 1 * FROM PRODUTOS").then(res => {
  if (res && res.length > 0) console.log(Object.keys(res[0]));
}).catch(console.error);
