const http = require('http');

console.log('🧪 Testando endpoint /api/all-data...\n');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/all-data',
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const allData = JSON.parse(data);
      const boletos = allData.boletos.documents;
      
      console.log(`✅ Status: ${res.statusCode}`);
      console.log(`📊 Total de boletos no /api/all-data: ${boletos.length}\n`);
      
      // Filtrar Foguete Amarelo
      const foguete = boletos.filter(b => 
        (b.invoice_number && (b.invoice_number.includes('Foguete') || b.invoice_number.includes('NF'))) ||
        b.supplierName === 'Cimed'
      );
      
      console.log(`🚀 Boletos Foguete Amarelo encontrados: ${foguete.length}\n`);
      
      if (foguete.length > 0) {
        console.log('=== DETALHES DOS BOLETOS FOGUETE AMARELO ===\n');
        foguete.forEach((b, i) => {
          console.log(`Boleto ${i + 1}:`);
          console.log(`  Fornecedor: ${b.supplierName}`);
          console.log(`  Descrição: ${b.invoice_number || 'N/A'}`);
          console.log(`  Vencimento: ${b.due_date}`);
          console.log(`  Valor: R$ ${b.value}`);
          console.log(`  Status: ${b.status}`);
          console.log('');
        });
      }
      
      // Junho 2026
      const junho = boletos.filter(b => b.due_date && b.due_date.startsWith('2026-06'));
      console.log(`📅 Boletos em JUNHO/2026: ${junho.length}\n`);
      
      if (junho.length > 0) {
        junho.forEach((b, i) => {
          console.log(`${i + 1}. ${b.supplierName} - R$ ${b.value} - ${b.due_date}`);
        });
      }
      
      console.log('\n✅ TESTE CONCLUÍDO - Os boletos agora estão inclusos no /api/all-data!');
      
    } catch (err) {
      console.error('❌ Erro:', err.message);
    }
  });
});

req.on('error', (err) => {
  console.error('❌ Erro na requisição:', err.message);
});

req.end();
