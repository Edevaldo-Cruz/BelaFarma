const OpenAI = require('openai');
const fetch = require('node-fetch');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Função genérica para chamar IA (OpenAI, Gemini ou Ollama)
 */
async function callAI(prompt, systemPrompt = '', options = {}) {
  const primaryProvider = process.env.AI_PROVIDER || 'openai';
  const temperature = options.temperature || 0.7;
  const maxTokens = options.maxTokens || 8192;

  const runAI = async (provider) => {
    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
    
    if (provider === 'openai') {
      const model = process.env.GPT_MODEL || 'gpt-4o-mini';
      console.log(`[AI] Tentando OpenAI: ${model}`);
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
      if (!apiKey) throw new Error('GEMINI_API_KEY não configurada.');

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      console.log(`[AI] Tentando Fallback Gemini: ${model}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: {
            temperature: temperature,
            maxOutputTokens: maxTokens,
          }
        })
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini Error: ${err}`);
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    throw new Error(`Provedor desconhecido: ${provider}`);
  };

  try {
    // Tenta o provedor principal
    return await runAI(primaryProvider);
  } catch (error) {
    console.error(`[AI] Erro no provedor principal (${primaryProvider}):`, error.message);
    
    // Se o principal falhou e não era o Gemini, tenta o Gemini como fallback
    if (primaryProvider !== 'gemini' && process.env.GEMINI_API_KEY) {
      console.log('[AI] Acionando motor de backup (Gemini)...');
      try {
        return await runAI('gemini');
      } catch (fallbackError) {
        console.error('[AI] Erro também no fallback Gemini:', fallbackError.message);
        throw fallbackError;
      }
    }
    
    throw error;
  }
}

module.exports = { callAI };
