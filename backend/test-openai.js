require('dotenv').config({ path: '../.env' });
const OpenAI = require('openai');

const key = process.env.OPENAI_API_KEY;

if (!key) {
  console.error('❌ OPENAI_API_KEY não encontrada no .env');
  process.exit(1);
}

console.log('✅ Chave encontrada no .env:', key.substring(0, 12) + '...');
console.log('🔄 Testando conexão com a API da OpenAI (gpt-4o-mini)...');

const openai = new OpenAI({
  apiKey: key,
});

async function testarAPI(tentativas = 1) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Você é um assistente prestativo." },
        { role: "user", content: "Olá, responda com apenas uma palavra: OK." },
      ],
    });

    console.log('\n✅ Conexão bem sucedida!');
    console.log('Resposta da IA:', completion.choices[0].message.content);
    
  } catch (error) {
    if (error.status === 429 && tentativas < 3) {
      console.warn(`\n⚠️ Recebido erro 429 (Cota/Limite). Tentando novamente em 5 segundos... (Tentativa ${tentativas})`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      return testarAPI(tentativas + 1);
    }

    console.error('\n❌ Erro na API da OpenAI:');
    if (error.status) {
      console.error('Status:', error.status);
      console.error('Mensagem:', error.message);
      
      if (error.message.includes('quota')) {
        console.error('\n💡 DICA: O erro menciona "EXCEEDED YOUR CURRENT QUOTA".');
        console.error('Isso geralmente significa que a conta está sem créditos ou o plano gratuito expirou,');
        console.error('e não necessariamente que as requisições estão rápidas demais.');
      }
    } else {
      console.error('Mensagem:', error.message);
    }
  }
}

testarAPI();
