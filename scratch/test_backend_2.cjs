async function run() {
    try {
        const url = 'http://192.168.1.10:8085/api/whatsapp/groups';
        console.log('Fetching', url);
        const res = await fetch(url);
        console.log('Status:', res.status);
        const text = await res.text();
        console.log('Response:', text);
    } catch (err) {
        console.error('Error:', err.message);
    }
}
run();
