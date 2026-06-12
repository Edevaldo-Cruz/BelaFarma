const API_URL = 'http://192.168.1.70:8080';

async function main() {
  const urls = [
    `${API_URL}/local/openapi.json`,
    `${API_URL}/docs-json`,
    `${API_URL}/openapi.json`
  ];
  
  for (const url of urls) {
    try {
      console.log(`Tentando baixar OpenAPI spec de: ${url}`);
      const res = await fetch(url);
      if (res.ok) {
        const spec = await res.json();
        console.log('Sucesso! Analisando caminhos...');
        const paths = Object.keys(spec.paths);
        const contactPaths = paths.filter(p => p.includes('contact') || p.includes('profile') || p.includes('number'));
        console.log('Caminhos relevantes encontrados:', JSON.stringify(contactPaths, null, 2));
        return;
      }
    } catch (err) {
      console.log(`Erro ao tentar ${url}:`, err.message);
    }
  }
  console.log('Nao foi possivel baixar o spec OpenAPI.');
}

main();
