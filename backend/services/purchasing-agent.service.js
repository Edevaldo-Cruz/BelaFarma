require('dotenv').config();
const csv = require('csv-parser');
const pdf = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const { callAI } = require('./ai.service');

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

async function chamarIA(prompt, systemNote = '') {
  try {
    return await callAI(prompt, ISA_COMPRAS_SYSTEM_PROMPT + (systemNote ? `\n\nCONTEXTO ADICIONAL:\n${systemNote}` : ''), { temperature: 0.2 });
  } catch (error) {
    console.error('[IsaCompras] Erro ao chamar IA:', error.message);
    throw error;
  }
}

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

  return chamarIA(prompt);
}

module.exports = {
  analisarRelatoriosDigifarma,
  ISA_COMPRAS_SYSTEM_PROMPT
};
