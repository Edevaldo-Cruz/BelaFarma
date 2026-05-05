
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

module.exports = (app) => {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!GEMINI_API_KEY) {
    console.warn('[Medication AI] Aviso: GEMINI_API_KEY não configurada no servidor.');
  }

  // Helper para chamar o Gemini
  async function callGemini(prompt, schema = null) {
    if (!GEMINI_API_KEY) throw new Error('API Key do Gemini não configurada.');

    const modelId = 'gemini-2.0-flash'; // Usando o modelo mais recente e rápido
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GEMINI_API_KEY}`;

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    };

    if (schema) {
      body.generationConfig.responseSchema = schema;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API Error: ${response.status} - ${err}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('IA não retornou conteúdo válido.');
    
    return text;
  }

  // POST /api/ai/medication-suggestions
  app.post('/api/ai/medication-suggestions', async (req, res) => {
    try {
      const { query } = req.body;
      if (!query) return res.status(400).json({ error: 'Query é obrigatória.' });

      const prompt = `Sugira 5 nomes de medicamentos que começam ou soam parecidos com: "${query}". Retorne apenas uma lista JSON de strings.`;
      const schema = {
        type: "ARRAY",
        items: { type: "STRING" }
      };

      const result = await callGemini(prompt, schema);
      res.json(JSON.parse(result));
    } catch (err) {
      console.error('[Medication AI] Erro nas sugestões:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/ai/medication-info
  app.post('/api/ai/medication-info', async (req, res) => {
    try {
      const { medName } = req.body;
      if (!medName) return res.status(400).json({ error: 'Nome do medicamento é obrigatório.' });

      const prompt = `Forneça informações técnicas detalhadas para o medicamento: "${medName}". 
      Destaque claramente o Princípio Ativo (DCB/DCI).
      Inclua apresentações comuns. 
      Se o medicamento for Isento de Prescrição (MIP), o campo required deve ser false e a color deve ser "Nenhuma".`;

      const schema = {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          activeIngredient: { type: "STRING" },
          indication: { type: "STRING" },
          presentations: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                label: { type: "STRING" },
                adult: { type: "STRING" },
                pediatric: { type: "STRING" }
              },
              required: ["label", "adult", "pediatric"]
            }
          },
          prescriptionRequirement: {
            type: "OBJECT",
            properties: {
              required: { type: "BOOLEAN" },
              color: { type: "STRING" },
              description: { type: "STRING" }
            },
            required: ["required", "color", "description"]
          },
          restrictions: { type: "ARRAY", items: { type: "STRING" } },
          contraindications: { type: "STRING" }
        },
        required: ["name", "activeIngredient", "indication", "presentations", "prescriptionRequirement", "restrictions", "contraindications"]
      };

      const result = await callGemini(prompt, schema);
      res.json(JSON.parse(result));
    } catch (err) {
      console.error('[Medication AI] Erro nos detalhes:', err.message);
      res.status(500).json({ error: err.message });
    }
  });
};
