require('dotenv').config({ path: '../.env' });

const key = process.env.GEMINI_API_KEY;

if (!key) {
  console.error('❌ ERRO: A chave GEMINI_API_KEY não foi encontrada no seu arquivo .env');
  console.log('Certifique-se de que o arquivo .env está na mesma pasta (backend) ou configure o caminho correto.');
  process.exit(1);
}

console.log('✅ Chave encontrada no .env:', key.substring(0, 10) + '...');
console.log('🔄 Testando conexão com a API do Google Gemini (gemini-1.5-flash)...');

const GEMINI_MODEL = 'gemini-flash-latest';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

async function testarAPI() {
  try {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Diga apenas a palavra 'Sucesso' se você estiver me ouvindo." }] }],
        generationConfig: { maxOutputTokens: 10 }
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`\n❌ Falha na API. Status: ${response.status}`);
      console.error(`Detalhes do erro: ${err}`);
      process.exit(1);
    }

    const data = await response.json();
    const texto = data.candidates?.[0]?.content?.parts?.[0]?.text || "(Sem resposta de texto)";
    console.log('\n🎉 SUCESSO! A API respondeu:');
    console.log(`"${texto.trim()}"`);
    console.log('\nSua chave está funcionando perfeitamente!');
    
  } catch (error) {
    console.error('\n❌ Erro de conexão:', error.message);
    if (error.cause) {
      console.error('Detalhes da causa:', error.cause);
    }
  }
}

testarAPI();
