async function run() {
  try {
    console.log('Querying http://192.168.1.70:3001/api/system/status...');
    const res = await fetch('http://192.168.1.70:3001/api/system/status');
    console.log('Status code:', res.status);
    const data = await res.json();
    console.log('System Health Result:\n', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error fetching system status:', err.message);
  }
}

run();
