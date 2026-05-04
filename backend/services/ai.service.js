const OpenAI = require('openai');
const fetch = require('node-fetch');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Função genérica para chamar IA (OpenAI, Gemini ou Ollama)
 */
async function callAI(prompt, systemPrompt = '', options = {}) {
  const provider = process.env.AI_PROVIDER || 'openai';
  const temperature = options.temperature || 0.7;
  const maxTokens = options.maxTokens || 8192;

  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

  try {
    if (provider === 'openai') {
      const model = process.env.GPT_MODEL || 'gpt-4o-mini';
      console.log(`[AI] Chamando OpenAI: ${model}`);
      const response = await openai.chat.completions.create({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: temperature,
        max_tokens: maxTokens,
      });
      return response.choices[0].message.content.trim();
    } 
    
    if (provider === 'gemini') {
      const model = 'gemini-2.0-flash';
      const apiKey = process.env.GEMINI_API_KEY;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      
      console.log(`[AI] Chamando Gemini: ${model}`);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: {
            temperature: temperature,
            topP: 0.95,
            maxOutputTokens: maxTokens,
          }
        })
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini Error ${response.status}: ${err}`);
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    if (provider === 'ollama') {
      const model = process.env.OLLAMA_MODEL || 'llama3.2:3b';
      const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
      
      console.log(`[AI] Chamando Ollama: ${model}`);
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model,
          prompt: fullPrompt,
          stream: false,
          options: {
            temperature: temperature
          }
        })
      });

      if (!response.ok) throw new Error(`Ollama Error ${response.status}`);
      const data = await response.json();
      return data.response.trim();
    }

    throw new Error(`Provedor de IA desconhecido: ${provider}`);
  } catch (error) {
    console.error(`[AI] Erro no provedor ${provider}:`, error.message);
    throw error;
  }
}

module.exports = { callAI };
