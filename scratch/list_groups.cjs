const API_URL = 'http://192.168.1.70:8080';
const API_KEY = 'BelafarmaSul2026';
const INSTANCES = ['belaFarma', 'belaAtende'];

async function checkGroups(instance) {
    console.log(`\n--- Fetching groups for instance: ${instance} ---`);
    const urls = [
        `${API_URL}/group/fetchAllGroups/${instance}?getParticipants=false`,
        `${API_URL}/group/fetchAll/${instance}`
    ];
    
    for (const url of urls) {
        console.log(`Trying URL: ${url}`);
        try {
            const res = await fetch(url, {
                headers: { 'apikey': API_KEY }
            });
            console.log('  Status:', res.status);
            const text = await res.text();
            console.log('  Response length:', text.length);
            if (text.length > 0) {
                console.log('  Response (first 200 chars):', text.substring(0, 200));
                try {
                    const parsed = JSON.parse(text);
                    console.log(`  Parsed JSON successfully! Items: ${Array.isArray(parsed) ? parsed.length : 'Not an array'}`);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        console.log('  First item:', JSON.stringify(parsed[0], null, 2));
                    }
                } catch (pe) {
                    console.log('  JSON parse error:', pe.message);
                }
            }
        } catch (e) {
            console.error('  Error:', e.message);
        }
    }
}

async function run() {
    for (const inst of INSTANCES) {
        await checkGroups(inst);
    }
}

run();
