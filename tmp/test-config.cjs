require('dotenv').config();
const scheduler = require('./backend/services/marketing-scheduler.service');

console.log('--- Verificação de Configurações ---');
console.log('Número Rosana (env):', process.env.MARKETING_ROSANA_PHONE);
console.log('Número Rosana (scheduler):', scheduler.getRosanaPhone());

const agora = new Date();
const formatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: 'numeric',
  minute: 'numeric',
  hour12: false
});

const parts = formatter.formatToParts(agora);
const hora = parseInt(parts.find(p => p.type === 'hour').value);
const minuto = parseInt(parts.find(p => p.type === 'minute').value);

console.log('Data Local:', agora.toString());
console.log('Hora Brasília detectada:', hora + ':' + minuto);

if (process.env.MARKETING_ROSANA_PHONE === '+5532988765295') {
    console.log('✅ Número da Rosana OK!');
} else {
    console.log('❌ Número da Rosana INCORRETO:', process.env.MARKETING_ROSANA_PHONE);
}
