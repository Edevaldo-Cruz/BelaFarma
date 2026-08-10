async function checkEvo() {
  try {
    const key = 'BelafarmaSul2026';
    const evoUrl = 'http://192.168.1.70:8080';
    console.log('1. Consultando instâncias na Evolution API...');
    const instRes = await fetch(`${evoUrl}/instance/fetchInstances`, {
      headers: { 'apikey': key }
    });
    const insts = await instRes.json();
    console.log('Instâncias Evolution:', insts);
  } catch (e) {
    console.error('Erro ao consultar Evolution API:', e.message);
  }
}

checkEvo();
