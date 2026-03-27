const fetch = require('node-fetch');

async function testQuotation() {
  console.log('Testando /api/quotation/analyze...');
  try {
    const res = await fetch('http://localhost:3001/api/quotation/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        suppliers: [
          { id: '1', name: 'Distribuidora A', text: 'AMOXICILINA 500mg - R$ 5,50' },
          { id: '2', name: 'Distribuidora B', text: 'AMOXICILINA 500mg - R$ 4,80' }
        ]
      })
    });
    
    console.log('Status HTTP:', res.status);
    const text = await res.text();
    console.log('Resposta Body:', text.substring(0, 500));
  } catch(e) {
    console.error('Erro de request:', e.message);
  }
}

async function testHealth() {
  console.log('\nTestando /api/financial-health/analyze...');
  try {
    const res = await fetch('http://localhost:3001/api/financial-health/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: 30 })
    });
    
    console.log('Status HTTP:', res.status);
    const text = await res.text();
    console.log('Resposta Body:', text.substring(0, 500));
  } catch(e) {
    console.error('Erro de request:', e.message);
  }
}

async function run() {
  await testQuotation();
  await testHealth();
}
run();
