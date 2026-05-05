
const { callAI } = require('./services/ai.service');

module.exports = (app) => {
  
  // POST /api/ai/medication-suggestions
  app.post('/api/ai/medication-suggestions', async (req, res) => {
    try {
      const { query } = req.body;
      if (!query) return res.status(400).json({ error: 'Query é obrigatória.' });

      const prompt = `Sugira 5 nomes de medicamentos que começam ou soam parecidos com: "${query}". 
      RETORNE APENAS UM ARRAY JSON DE STRINGS. Exemplo: ["Dipirona", "Dramin"]
      Não inclua explicações, apenas o JSON.`;

      const result = await callAI(prompt, "Você é um assistente farmacêutico que responde estritamente em JSON.");
      
      // Tenta extrair o JSON caso a IA envie markdown (```json ...)
      let cleanJson = result.replace(/```json|```/g, '').trim();
      res.json(JSON.parse(cleanJson));
    } catch (err) {
      console.error('[Medication AI] Erro nas sugestões:', err.message);
      res.status(500).json({ error: 'Erro ao processar sugestões com GPT.' });
    }
  });

  // POST /api/ai/medication-info
  app.post('/api/ai/medication-info', async (req, res) => {
    try {
      const { medName } = req.body;
      if (!medName) return res.status(400).json({ error: 'Nome do medicamento é obrigatório.' });

      const prompt = `Forneça informações técnicas detalhadas para o medicamento: "${medName}". 
      Destaque claramente o Princípio Ativo (DCB/DCI).
      Se o medicamento for Isento de Prescrição (MIP), o campo required deve ser false e a color deve ser "Nenhuma".

      RESPONDA ESTRITAMENTE COM O SEGUINTE FORMATO JSON:
      {
        "name": "Nome",
        "activeIngredient": "Princípio Ativo",
        "indication": "Indicação",
        "presentations": [{"label": "Ex: 500mg", "adult": "Dose", "pediatric": "Dose"}],
        "prescriptionRequirement": {"required": true/false, "color": "Azul/Amarela/Branca/Nenhuma", "description": "Explicação"},
        "restrictions": ["Restrição 1"],
        "contraindications": "Texto"
      }`;

      const result = await callAI(prompt, "Você é um especialista em farmacologia brasileira. Responda apenas com JSON puro.");
      
      let cleanJson = result.replace(/```json|```/g, '').trim();
      res.json(JSON.parse(cleanJson));
    } catch (err) {
      console.error('[Medication AI] Erro nos detalhes:', err.message);
      res.status(500).json({ error: 'Erro ao processar informações com GPT.' });
    }
  });
};
