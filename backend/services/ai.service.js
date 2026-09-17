const OpenAI = require('openai');
const fetch = require('node-fetch');

require('dotenv').config();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder-bela-farma',
});

let dbInstance = null;
function getDb() {
  if (!dbInstance) {
    try {
      dbInstance = require('../database');
      dbInstance.prepare(`
        CREATE TABLE IF NOT EXISTS ai_daily_usage (
          date TEXT PRIMARY KEY,
          count INTEGER DEFAULT 0,
          lastUpdated TEXT
        )
      `).run();
    } catch (e) {
      console.warn('[AI RateLimit] Aviso ao inicializar tabela no banco:', e.message);
    }
  }
  return dbInstance;
}

/**
 * Verifica e incrementa o contador diário de requisições de IA
 */
function checkAndIncrementDailyUsage(options = {}) {
  const maxLimit = parseInt(process.env.MAX_AI_REQUESTS_PER_DAY, 10) || 1500;
  const db = getDb();
  if (!db) return true;

  const today = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());

  const row = db.prepare('SELECT count FROM ai_daily_usage WHERE date = ?').get(today);
  const currentCount = row ? row.count : 0;

  // Operações de auditoria financeira crítica (ex: PIX Bot) nunca devem ser bloqueadas
  if (options.bypassLimit || options.isPriority) {
    db.prepare(`
      INSERT INTO ai_daily_usage (date, count, lastUpdated)
      VALUES (?, 1, datetime('now'))
      ON CONFLICT(date) DO UPDATE SET count = count + 1, lastUpdated = datetime('now')
    `).run(today);
    console.log(`[AI RateLimit] ⚡ Operação prioritária liberada (${currentCount + 1}/${maxLimit})`);
    return true;
  }

  if (currentCount >= maxLimit) {
    const msg = `[AI RateLimit] 🛑 Trava de segurança ativada: Limite diário de ${maxLimit} requisições de IA atingido para hoje (${today}).`;
    console.warn(msg);
    throw new Error(`Limite diário de requisições de IA atingido (${maxLimit}/dia). Bloqueado por segurança.`);
  }

  db.prepare(`
    INSERT INTO ai_daily_usage (date, count, lastUpdated)
    VALUES (?, 1, datetime('now'))
    ON CONFLICT(date) DO UPDATE SET count = count + 1, lastUpdated = datetime('now')
  `).run(today);

  console.log(`[AI RateLimit] 📊 Requisições de IA hoje (${today}): ${currentCount + 1}/${maxLimit}`);
  return true;
}

/**
 * Retorna o consumo diário de IA atual
 */
function getDailyUsage() {
  const maxLimit = parseInt(process.env.MAX_AI_REQUESTS_PER_DAY, 10) || 200;
  const db = getDb();
  const today = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());

  if (!db) return { today, count: 0, maxLimit, remaining: maxLimit };

  const row = db.prepare('SELECT count FROM ai_daily_usage WHERE date = ?').get(today);
  const count = row ? row.count : 0;
  return {
    today,
    count,
    maxLimit,
    remaining: Math.max(0, maxLimit - count)
  };
}

/**
 * Função genérica para chamar IA (OpenAI, Gemini ou Ollama)
 */
async function callAI(prompt, systemPrompt = '', options = {}) {
  // Trava de segurança: impede gasto descontrolado de tokens se houver loop
  checkAndIncrementDailyUsage(options);

  const primaryProvider = process.env.AI_PROVIDER || 'openai';
  const temperature = options.temperature !== undefined ? options.temperature : 0.7;
  const maxTokens = options.maxTokens || 8192;
  const imageData = options.imageData; // Base64 da imagem se houver

  const runAI = async (provider) => {
    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
    
    if (provider === 'openai') {
      const model = process.env.GPT_MODEL || 'gpt-4o-mini';
      console.log(`[AI] Tentando OpenAI: ${model} ${imageData ? '(com imagem)' : ''}`);
      
      const messages = [
        { role: 'system', content: systemPrompt }
      ];

      if (imageData) {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: imageData.startsWith('data:') ? imageData : `data:image/jpeg;base64,${imageData}`
              }
            }
          ]
        });
      } else {
        messages.push({ role: 'user', content: prompt });
      }

      const response = await openai.chat.completions.create({
        model: model,
        messages: messages,
        temperature: temperature,
        max_tokens: maxTokens,
      });
      return response.choices[0].message.content.trim();
    } 
    
    if (provider === 'gemini') {
      const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('GEMINI_API_KEY não configurada.');

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      console.log(`[AI] Tentando Gemini: ${model} ${imageData ? '(com imagem)' : ''}`);
      
      const contents = [];
      const parts = [{ text: fullPrompt }];

      if (imageData) {
        let mimeType = options.mimeType || 'image/jpeg';
        let base64Content = imageData;

        if (imageData.startsWith('data:')) {
          const match = imageData.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            mimeType = match[1];
            base64Content = match[2];
          }
        } else if (imageData.includes('base64,')) {
          base64Content = imageData.split('base64,')[1];
        }

        parts.push({
          inlineData: {
            mimeType: mimeType,
            data: base64Content
          }
        });
      }

      contents.push({ parts });

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: contents,
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
    } else if (primaryProvider === 'gemini' && process.env.OPENAI_API_KEY) {
      console.log('[AI] Acionando motor de backup (OpenAI)...');
      try {
        return await runAI('openai');
      } catch (fallbackError) {
        console.error('[AI] Erro também no fallback OpenAI:', fallbackError.message);
        throw fallbackError;
      }
    }
    
    throw error;
  }
}

module.exports = { callAI, getDailyUsage, checkAndIncrementDailyUsage };
