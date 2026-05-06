const API_URL = 'http://192.168.1.10:8080';
const INSTANCE_NAME = 'belafarma';
const API_KEY = 'BelafarmaSul2026';

async function run() {
    try {
        const url = `${API_URL}/group/fetchAllGroups/${INSTANCE_NAME}?getParticipants=false`;
        const res = await fetch(url, { headers: { 'apikey': API_KEY } });
        const data = await res.json();
        
        console.log(JSON.stringify(data, null, 2));
        
    } catch (err) {
        console.error('Error:', err.message);
    }
}

run();
