async function check() {
  try {
    const res = await fetch('http://192.168.1.70:8085/api/whatsapp/offers-bank/history');
    if (res.ok) {
      const data = await res.json();
      console.log('--- Histórico de Posts Recentes ---');
      console.log(data.slice(0, 5));
    }
  } catch (e) {
    console.error('Erro:', e.message);
  }
}

check();
