const http = require('http');

console.log('🧪 Testando endpoint /api/boletos...\n');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/boletos',
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const boletos = JSON.parse(data);
      
      console.log(`✅ Status: ${res.statusCode}`);
      console.log(`📊 Total de boletos retornados: ${boletos.length}\n`);
      
      // Filtrar apenas Foguete Amarelo
      const foguete = boletos.filter(b => 
        b.invoice_number && b.invoice_number.includes('Foguete') ||
        b.supplierName === 'Cimed'
      );
      
      console.log(`🚀 Boletos Foguete Amarelo encontrados: ${foguete.length}\n`);
      
      if (foguete.length > 0) {
        console.log('=== DETALHES DOS BOLETOS FOGUETE AMARELO ===\n');
        foguete.forEach((b, i) => {
          console.log(`Boleto ${i + 1}:`);
          console.log(`  ID: ${b.id}`);
          console.log(`  Fornecedor: ${b.supplierName}`);
          console.log(`  Descrição/NF: ${b.invoice_number || 'N/A'}`);
          console.log(`  Vencimento: ${b.due_date}`);
          console.log(`  Valor: R$ ${b.value}`);
          console.log(`  Status: ${b.status}`);
          console.log('');
        });
      }
      
      // Verificar junho de 2026
      const junho2026 = boletos.filter(b => 
        b.due_date && b.due_date.startsWith('2026-06')
      );
      
      console.log(`📅 Boletos em Junho/2026: ${junho2026.length}\n`);
      
      if (junho2026.length > 0) {
        console.log('=== BOLETOS EM JUNHO/2026 ===\n');
        junho2026.forEach((b, i) => {
          console.log(`${i + 1}. ${b.supplierName} - R$ ${b.value} - ${b.due_date} - ${b.status}`);
        });
      }
      
    } catch (err) {
      console.error('❌ Erro ao parsear resposta:', err.message);
      console.log('Resposta bruta:', data);
    }
  });
});

req.on('error', (err) => {
  console.error('❌ Erro na requisição:', err.message);
});

req.end();
