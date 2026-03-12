require('dotenv').config();
const csv = require('csv-parser');
const pdf = require('pdf-parse');
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-flash-latest';

const ISA_COMPRAS_SYSTEM_PROMPT = `
Perfil: Você é a Isa-Compras, gerente de suprimentos da Bela Farma Sul. Sua missão é garantir o melhor giro de estoque com o menor capital imobilizado possível. Você é organizada, detalhista e focada em prazos.

Fontes de Dados: Você deve basear suas decisões nos relatórios de Curva ABC e Estoque do Digifarma localizados no diretório comum do sistema.

Rotinas Semanais:
TERÇA-FEIRA (Medicamentos): Analisar faltas e giro de medicamentos. Gerar lista de compras formatada.
QUARTA-FEIRA (Perfumaria): Analisar giro e novidades de perfumaria/HPC. Gerar lista de compras formatada.
FECHAMENTO: Após a aprovação do Edevaldo, gerar um relatório resumido de intenção de compra e enviar para a Nayane via WhatsApp (Evolution API).

Funções Específicas:
Gestão de Fornecedores: Você mantém um cadastro de fornecedores (nome, contato WhatsApp e categoria).
Cotação Automática: Ao gerar a lista, pergunte: "Ed, deseja que eu envie esta lista para cotação agora?". Se sim, dispare a lista para os fornecedores cadastrados via Evolution API.
Separação por Categoria: Nunca misture medicamentos com perfumaria. São orçamentos e fornecedores diferentes.

Formatação de Saída:
Listas de compras devem conter: [Código Digifarma] | [Produto] | [Qtd Sugerida] | [Último Preço Pago].

Frase de Ordem: "Comprar bem é o primeiro passo para vender com lucro."
`;

async function chamarGemini(prompt, systemNote = '') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('A chave da API (GEMINI_API_KEY) não está identificada.');
  }

  const tokenUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
  const promptCompleto = `${ISA_COMPRAS_SYSTEM_PROMPT}\n\n${systemNote ? `CONTEXTO ADICIONAL:\n${systemNote}\n\n` : ''}TAREFA:\n${prompt}`;

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptCompleto }] }],
      generationConfig: {
        temperature: 0.2, // Temperatura baixa para maior precisão em listas
        topP: 0.95,
        maxOutputTokens: 8192,
      }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * Processa relatórios do Digifarma para gerar sugestão de compra
 */
async function analisarRelatoriosDigifarma(files) {
  let combinedContent = '';

  for (const file of files) {
    const { path: filePath, name: fileName, type: mimeType } = file;
    let fileText = '';

    if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdf(dataBuffer);
      fileText = pdfData.text;
    } 
    else if (fileName.endsWith('.csv') || mimeType === 'text/csv') {
      fileText = await new Promise((resolve, reject) => {
        let content = '';
        fs.createReadStream(filePath)
          .pipe(csv())
          .on('data', (data) => { content += JSON.stringify(data) + '\n'; })
          .on('end', () => resolve(content))
          .on('error', reject);
      });
    }

    combinedContent += `\n--- ARQUIVO: ${fileName} ---\n${fileText.substring(0, 10000)}\n`;
  }

  const prompt = `
Com base nos relatórios anexados (Curva ABC e/ou Estoque), identifique as necessidades de compra.
Lembre-se das regras:
1. Terça é Medicamentos, Quarta é Perfumaria.
2. Formato: [Código Digifarma] | [Produto] | [Qtd Sugerida] | [Último Preço Pago].
3. Não misture categorias.

DADOS DOS RELATÓRIOS:
${combinedContent}

TAREFA: Gere a lista de sugestão de compra e termine perguntando se deseja enviar para cotação.
`;

  return chamarGemini(prompt);
}

module.exports = {
  analisarRelatoriosDigifarma,
  ISA_COMPRAS_SYSTEM_PROMPT
};
