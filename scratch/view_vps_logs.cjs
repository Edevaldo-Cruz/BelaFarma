const serverUrl = 'https://app.drogariabelafarma.com.br';
const logsUrl = `${serverUrl}/api/system/logs`;

async function getLogs() {
  console.log(`Buscando as últimas linhas do log do servidor de produção: ${logsUrl}`);
  try {
    const res = await fetch(logsUrl);
    console.log(`HTTP Status: ${res.status} ${res.statusText}`);
    
    if (res.ok) {
      const htmlContent = await res.text();
      // Remove tags HTML de pre para ler apenas o texto puro do log
      const cleanLogs = htmlContent.replace(/<[^>]*>/g, '');
      console.log('--- LOGS DA VPS DE PRODUÇÃO ---');
      console.log(cleanLogs.slice(-2000)); // Exibe os últimos 2000 caracteres do log
    } else {
      const text = await res.text();
      console.log('Erro ao ler logs da VPS:', text);
    }
  } catch (err) {
    console.error('Erro de conexão com a VPS:', err.message);
  }
}

getLogs();
