const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function testOpenAI() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error('Forneça o caminho da imagem.');
    process.exit(1);
  }

  try {
    const base64 = fs.readFileSync(imagePath).toString('base64');
    console.log('[Test] Chamando OpenAI com imagem...');
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "O que tem nesta imagem?" },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64}`
              }
            }
          ]
        }
      ],
      max_tokens: 300,
    });

    console.log('[Test] Sucesso!');
    console.log(response.choices[0].message.content);
  } catch (err) {
    console.error('[Test] Erro na OpenAI:', err.message);
    if (err.response) {
      console.error(err.response.data);
    }
  }
}

testOpenAI();
