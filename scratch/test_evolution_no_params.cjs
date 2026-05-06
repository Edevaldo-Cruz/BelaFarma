const API_URL = 'http://192.168.1.10:8080';
const INSTANCE_NAME = 'belafarma';
const API_KEY = 'BelafarmaSul2026';

async function run() {
    try {
        console.log('Testing Evolution API groups endpoint without getParticipants...');
        
        const url = `${API_URL}/group/fetchAllGroups/${INSTANCE_NAME}`;
        
        const res = await fetch(url, {
            headers: { 'apikey': API_KEY }
        });
        
        console.log('Status:', res.status);
        const data = await res.json();
        
        console.log('IsArray:', Array.isArray(data));
        console.log('Keys:', Object.keys(data));
        
    } catch (err) {
        console.error('Error:', err.message);
    }
}

run();
