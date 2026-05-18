const API_URL = 'http://192.168.1.70:8080';
const API_KEYS = ['BelafarmaSul2026', 'BelaAtende2026'];

async function run() {
    for (const key of API_KEYS) {
        console.log(`\nChecking with key: ${key}`);
        try {
            const url = `${API_URL}/instance/fetchInstances`;
            const res = await fetch(url, {
                headers: { 'apikey': key }
            });
            console.log('Status:', res.status);
            if (res.ok) {
                const data = await res.json();
                console.log('Instances found:', JSON.stringify(data.map(i => ({
                    name: i.instanceName || i.instance?.instanceName,
                    status: i.status || i.instance?.status,
                    phone: i.owner || i.instance?.owner
                })), null, 2));
            } else {
                console.log('Error text:', await res.text());
            }
        } catch (err) {
            console.error('Error:', err.message);
        }
    }
}

run();
