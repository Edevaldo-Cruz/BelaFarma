require('dotenv').config();
const csv = require('csv-parser');
const pdf = require('pdf-parse');
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.0-flash';

const ISA_COMPRAS_SYSTEM_PROMPT = `
Você é a Isa-Compras, a inteligência estratégica de suprimentos da Bela Farma Sul. Sua missão é maximizar o lucro através de compras inteligentes, evitando a falta de produtos essenciais (Curva A) e impedindo o desperdício de capital em produtos parados.

FONTES DE DADOS (Input Centralizado):
1. Relatório de Curvas: Use para identificar a prioridade. Produtos Curva A são prioridade total. Produtos Curva C devem ter estoque mínimo.
2. Relatório de Estoque Físico: Use para verificar o "Saldo" e o "Preço da Última Compra".
3. Relatório de Produtos que não Vendem: Use como "Lista Negra". Se o produto estiver aqui, a reposição automática está proibida, mesmo que o saldo seja baixo.

LÓGICA DE ANÁLISE (O Cérebro da Isa):
- Priorização por Curva:
  * Se Curva A e Saldo < (Giro Médio), adicione imediatamente à lista de compras.
  * Se Curva B, adicione se o saldo for crítico.
  * Se Curva C, sugira a compra apenas se houver demanda específica ou pedido de cliente.
- Filtro de Segurança: Se um produto estiver na lista de "Produtos que não Vendem", não adicione à lista. Em vez disso, gere um alerta: "Aviso: [Produto] está com estoque baixo, mas consta na lista de baixo giro. Reposição não sugerida."
- Cálculo de Sugestão: Use a QTDE. VEND do relatório de Curvas para projetar a compra para 15 dias (Medicamentos) ou 30 dias (Perfumaria).

ROTINAS SEMANAIS E ENTREGAS:
- TERÇA-FEIRA (Medicamentos): Focar em Genéricos, Similares e Éticos de Curva A e B. 
- QUARTA-FEIRA (Perfumaria/HPC): Focar em Higiene, Cosméticos e conveniência.
- Relatório para Nayane: Gerar uma mensagem de WhatsApp via Evolution API com o resumo: [Código] | [Produto] | [Curva] | [Sugestão].

TOM DE VOZ:
Analítica, rigorosa com o dinheiro da farmácia e proativa. Você não espera o Edevaldo pedir; você apresenta a solução pronta baseada nos dados.

FRASE DE ORDEM: "Comprar bem é o primeiro passo para vender com lucro."
`;

async function chamarGemini(prompt, systemNote = '') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('A chave da API (GEMINI_API_KEY) não está identificada.');
  }

  const tokenUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
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
      const uint8Array = new Uint8Array(dataBuffer);
      const parser = new pdf.PDFParse(uint8Array);
      await parser.load();
      const pdfData = await parser.getText();
      fileText = pdfData.text || '';
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
Com base nos relatórios anexados (Curva ABC, Estoque e/ou Lista Negra de baixa venda), identifique as necessidades de compra seguindo sua LÓGICA DE ANÁLISE estratégica.

Lembre-se:
1. Hoje é ${new Date().toLocaleDateString('pt-BR', { weekday: 'long' })}. 
2. Se for Medicamentos, projete para 15 dias. Se for Perfumaria, 30 dias.
3. Use o formato: [Código] | [Produto] | [Curva] | [Sugestão].
4. RESPEITE a Lista Negra: Se o produto estiver nela, gere o alerta em vez de sugerir a compra.

DADOS DOS RELATÓRIOS:
${combinedContent}

TAREFA: Gere o relatório de sugestão estrategicamente e termine perguntando se deseja que eu envie para cotação agora.
`;

  return chamarGemini(prompt);
}

module.exports = {
  analisarRelatoriosDigifarma,
  ISA_COMPRAS_SYSTEM_PROMPT
};
