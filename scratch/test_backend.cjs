const API_URL = 'http://192.168.1.10:3000'; // Assuming backend runs on 3000, or maybe it's exposed via 80/443

async function run() {
    try {
        console.log('Testing Node backend API /api/whatsapp/groups...');
        // Try direct backend port first
        let url = `${API_URL}/api/whatsapp/groups`;
        let res = await fetch(url).catch(e => null);
        
        if (!res) {
            console.log('Backend on 3000 not reachable, trying port 80...');
            url = `http://192.168.1.10/api/whatsapp/groups`;
            res = await fetch(url);
        }
        
        console.log('Status:', res.status);
        const text = await res.text();
        console.log('Response:', text);
        
    } catch (err) {
        console.error('Error:', err.message);
    }
}

run();
