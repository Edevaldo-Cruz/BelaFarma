const { queryDigifarma } = require('./services/digifarma.service.js');
queryDigifarma("SELECT FIRST 1 ENTRADA_SAIDA, CANCELAMENTO FROM CAB_NOTAS").then(console.log).catch(console.error);
