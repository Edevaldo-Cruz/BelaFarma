const API_URL = 'http://192.168.1.10:8080';
const INSTANCE_NAME = 'belafarma';
const API_KEY = 'BelafarmaSul2026';
const GROUP_ID = '120363427743006305@g.us';

async function run() {
    // Verificar versão e estado
    console.log('=== Versão da API ===');
    let res = await fetch(`${API_URL}/`);
    console.log(await res.text());

    console.log('\n=== Estado da instância ===');
    res = await fetch(`${API_URL}/instance/connectionState/${INSTANCE_NAME}`, {
        headers: { 'apikey': API_KEY }
    });
    console.log(await res.text());

    // Testar envio para número pessoal primeiro
    console.log('\n=== Teste envio pessoal ===');
    res = await fetch(`${API_URL}/message/sendText/${INSTANCE_NAME}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': API_KEY },
        body: JSON.stringify({
            number: '5532988634755',
            textMessage: { text: '🧪 Teste de conectividade - ' + new Date().toLocaleTimeString('pt-BR') }
        })
    });
    const personalResult = await res.text();
    console.log('Status:', res.status, '- Body:', personalResult);

    // Testar envio para grupo
    console.log('\n=== Teste envio grupo ===');
    res = await fetch(`${API_URL}/message/sendText/${INSTANCE_NAME}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': API_KEY },
        body: JSON.stringify({
            number: GROUP_ID,
            textMessage: { text: '🧪 Teste grupo - ' + new Date().toLocaleTimeString('pt-BR') }
        })
    });
    console.log('Status:', res.status, '- Body:', await res.text());

    // Listar grupos para verificar se o grupo ainda está acessível
    console.log('\n=== Verificar grupos ===');
    res = await fetch(`${API_URL}/group/fetchAllGroups/${INSTANCE_NAME}?getParticipants=true`, {
        headers: { 'apikey': API_KEY }
    });
    const groups = await res.json();
    console.log('Grupos:', JSON.stringify(groups.map(g => ({ id: g.id, subject: g.subject, size: g.size })), null, 2));
}

run();
