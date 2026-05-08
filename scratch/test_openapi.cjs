const API_URL = 'http://192.168.1.10:8080';
const API_KEY = 'BelafarmaSul2026';

async function run() {
    // Buscar a especificação OpenAPI completa
    const endpoints = [
        '/swagger-json',
        '/docs-json', 
        '/openapi.json',
        '/api-json',
        '/api/docs/json',
        '/-json'
    ];

    for (const ep of endpoints) {
        try {
            const res = await fetch(`${API_URL}${ep}`, { headers: { 'apikey': API_KEY } });
            if (res.ok) {
                const data = await res.json();
                // Extrair paths
                if (data.paths) {
                    const messagePaths = Object.keys(data.paths).filter(p => 
                        p.includes('message') || p.includes('group') || p.includes('send')
                    );
                    console.log(`Encontrado em ${ep}:`);
                    messagePaths.forEach(p => {
                        const methods = Object.keys(data.paths[p]);
                        console.log(`  ${methods.join(',')} ${p}`);
                        // Mostrar body schema se disponível
                        for (const method of methods) {
                            const op = data.paths[p][method];
                            if (op.requestBody?.content?.['application/json']?.schema) {
                                const schema = op.requestBody.content['application/json'].schema;
                                console.log(`    Schema:`, JSON.stringify(schema, null, 4).substring(0, 300));
                            }
                        }
                    });
                }
                break;
            }
        } catch (err) {
            // ignore
        }
    }
}

run();
