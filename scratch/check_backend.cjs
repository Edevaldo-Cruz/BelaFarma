const API_URL = 'http://192.168.1.70';

async function run() {
    console.log('Checking production backend server via Nginx at 192.168.1.70/api...');
    try {
        const res = await fetch(`${API_URL}/api/whatsapp/scheduled-posts`);
        console.log('Backend Status:', res.status);
        if (res.ok) {
            const data = await res.json();
            console.log('Scheduled posts found:', data.length);
            if (data.length > 0) {
                console.log('First scheduled post details:', JSON.stringify(data[0], null, 2));
            }
        } else {
            console.log('Error status:', res.status);
            console.log('Error text:', await res.text());
        }
    } catch (e) {
        console.error('Failed to contact production backend via Nginx:', e.message);
    }
}

run();
