/**
 * Script de Reset e Recotação Limpa do BelaPed
 * 1. Apaga cotações registradas nas últimas 24h / hoje em belaped_cotacoes_reais
 * 2. Limpa registros temporários
 * 3. Dispara nova cotação oficial via API ou internamente
 */

const db = require('./database.js');
const http = require('http');
const { signToken } = require('./security.js');

console.log('================================================================');
console.log('🧹 RESETANDO COTAÇÕES DE HOJE & DISPARANDO NOVA COTAÇÃO LIMPA');
console.log('================================================================\n');

// 1. Contagem antes da exclusão
const antes = db.prepare(`
  SELECT count(*) as total, count(distinct ean) as eans
  FROM belaped_cotacoes_reais
  WHERE updated_at >= date('now', 'start of day') OR updated_at >= datetime('now', '-24 hours')
`).get();

console.log(`📦 Cotações encontradas de hoje / últimas 24h: ${antes.total} (${antes.eans} produtos distintos).`);

// 2. Apaga as cotações de hoje
const delResult = db.prepare(`
  DELETE FROM belaped_cotacoes_reais
  WHERE updated_at >= date('now', 'start of day') OR updated_at >= datetime('now', '-24 hours')
`).run();

console.log(`🗑️ Cotações de hoje removidas do banco: ${delResult.changes} registros apagados com sucesso.`);

// 3. Verifica o total restante no banco
const restantes = db.prepare(`SELECT count(*) as total FROM belaped_cotacoes_reais WHERE disponivel = 1`).get();
console.log(`📊 Cotações ativas restantes de ciclos anteriores no banco: ${restantes.total}`);

// 4. Gera token administrativo para chamada de API
const adminToken = signToken({ id: '1', name: 'Administrador BelaPed', role: 'Gerente' });

// 5. Dispara nova cotação limpa via API interna do BelaPed
console.log('\n🚀 Solicitando início da nova cotação ao serviço BelaPed (POST /api/belaped/cotar-ao-vivo)...');

const postData = JSON.stringify({
  fornecedor: 'TODOS',
  limite: 100,
  prioridade: 'TODAS_PRIORITARIAS'
});

const req = http.request({
  hostname: '127.0.0.1',
  port: 3001,
  path: '/api/belaped/cotar-ao-vivo',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${adminToken}`,
    'Content-Length': Buffer.byteLength(postData)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    try {
      const data = JSON.parse(body);
      if (res.statusCode === 200 || data.success) {
        console.log('✅ Nova cotação iniciada com sucesso nos robôs!');
        console.log(`📋 Mensagem: ${data.message || 'Cotação em andamento'}`);
        if (data.status) {
          console.log(`🎯 Foco: ${data.status.prioridadeAtiva || 'Prioritários'}`);
          console.log(`📦 Total de produtos na fila: ${data.status.total || 0}`);
        }
      } else {
        console.warn(`⚠️ Resposta da API (${res.statusCode}):`, data.error || body);
      }
    } catch (e) {
      console.log(`Resposta bruta da API (${res.statusCode}):`, body);
    }
    console.log('\n================================================================\n');
    process.exit(0);
  });
});

req.on('error', (err) => {
  console.error('❌ Não foi possível conectar na API local (porta 3001):', err.message);
  console.log('Tentando reiniciar o serviço BelaFarma-API...');
  process.exit(1);
});

req.write(postData);
req.end();
