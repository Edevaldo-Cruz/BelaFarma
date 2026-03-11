require('dotenv').config();
const csv = require('csv-parser');
const pdf = require('pdf-parse');
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-flash-latest';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// ─── System Prompt da Isa-Financeiro ────────────────────────────────────────

const ISA_FINANCE_SYSTEM_PROMPT = `
Você é a ISA-FINANCEIRO, a consultora, vigilante financeira e conselheira da diretoria da Bela Farma Sul.

PERFIL:
Seu foco é proteger o caixa da empresa, reduzir gastos desnecessários e ser a guardiã da separação
rígida entre as contas de Pessoa Física (PF) e Pessoa Jurídica (PJ). Você é inteligente, analítica e 
muito direta, porém tem um tom amigável e educativo de "mentora de pequenos negócios".

OBJETIVOS:
1. Análise de Boletos: Avaliar risco no fluxo de caixa e sugerir cortes se a dívida estiver alta.
2. Fechamento de Caixa: Analisar a margem de lucro real confrontando Faturamento x Saídas diárias.
3. Educação Financeira: Dar "pílulas médicas" (conselhos firmes e curtos) para os donos sobre gestão.
4. Análise do Digifarma: Ler relatórios brutos de vendas/compras e resumir lucratividade do giro.

REGRAS DE COMUNICAÇÃO:
- Não seja robótica, não use "Prezado" ou termos frios bancários. 
- Use *negrito* para destacar números preocupantes ou positivos.
- Se o fechamento diário tiver muitas saídas "PJ paga PF" seja MUITO ENFÁTICA sobre o perigo disso.
- "Estoque parado é dinheiro perdendo valor" — lembre-os sempre do princípio do varejo.
- Use poucos emojis focados em dinheiro, gráficos e sinais de alerta: 💰📉📈🚨💡
- Suas falas curtas finais (Pílulas) devem bater direto na mentalidade do empresário.

FORMATAÇÃO DO RELATÓRIO:
- Use markdown para facilitar a leitura no painel administrativo.
- Seja visual (listas curtas, pontos de atenção bem destacados).
`;

// ─── Funções Utilitárias ───────────────────────────────────────────────────

async function chamarGemini(prompt, systemNote = '') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('A chave da API (GEMINI_API_KEY) não está identificada.');
  }

  const tokenUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
  const promptCompleto = `${ISA_FINANCE_SYSTEM_PROMPT}\n\n${systemNote ? `CONTEXTO ADICIONAL:\n${systemNote}\n\n` : ''}TAREFA:\n${prompt}`;

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: promptCompleto }] }],
      generationConfig: {
        temperature: 0.7,
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

// ─── Funções Principais (Agente Financeiro) ───────────────────────────────

/**
 * 1. Pílula de Gestão Diária (Insight rápido para o dashboard)
 */
async function gerarPilulaEducacao() {
  const prompt = `
Gere UMA pílula de gestão financeira (máximo de 3 linhas) para exibir no painel da Bela Farma Sul.
O foco hoje precisa ser: Separação de contas PF e PJ, ou Controle de Estoque ou Retiradas indevidas do Caixa.
Inicie sempre com um emoji impactante.
Assine como "— Isa 💰"
`;
  return chamarGemini(prompt);
}

/**
 * 2. Análise Instantânea de Caixa Baseada no DB
 */
async function analisarFechamentoDeCaixa(db) {
  // Coletar dados da tabela cash_closing_records para análise
  const fechamentos = db.prepare(`
    SELECT date, totalSales, difference, 
           pix, debit, credit, 
           totalInDrawer, expenses
    FROM cash_closings
    ORDER BY date DESC LIMIT 7
  `).all();

  const contasAPagar = db.prepare(`
    SELECT SUM(totalValue) as total 
    FROM orders 
    WHERE status = 'Pendente' 
      AND (arrivalForecast >= date('now') AND arrivalForecast <= date('now', '+7 days'))
  `).get();

  let resumoFechamentos = "Nenhum fechamento registrado recentemente.";
  if (fechamentos && fechamentos.length > 0) {
    resumoFechamentos = fechamentos.map(f => {
      return `- Data: ${f.date} | Faturamento: R$ ${f.totalSales?.toFixed(2) || '0.00'} | Despesas: R$ ${f.expenses?.toFixed(2) || '0.00'} | Diferença: R$ ${f.difference?.toFixed(2) || '0.00'}`;
    }).join('\n');
  }

  const prompt = `
DADOS DA SEMANA:
===============
Últimos Fechamentos:
${resumoFechamentos}

COMPROMISSOS PRÓXIMOS:
- Boletos a pagar (próximos 7 dias): R$ ${contasAPagar?.total?.toFixed(2) || '0.00'}

TAREFA:
Escreva um laudo de Vigilância Financeira (Laudo da Isa) analisando estes números.
1. Há lucro operacional no momento? (Faturamento vs Despesas)
2. Se a diferença de caixa for alta/frequente, dê uma bronca construtiva.
3. Considerando os boletos da semana, o faturamento diário médio será suficiente para honrá-los sem sangrar o caixa da loja?
4. Termine com um "Conselho de Ouro" focado em blindagem de caixa e fluxo.
`;

  return chamarGemini(prompt);
}

/**
 * 3. Análise de Relatórios Digifarma (Upload CSV/PDF)
 */
async function analisarRelatorioDigifarma(filePath, fileName, mimeType) {
  let conteudoTexto = '';

  try {
    if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdf(dataBuffer);
      conteudoTexto = pdfData.text.substring(0, 15000); // Limite de parsing para 15k chars
    } 
    else if (fileName.endsWith('.csv') || mimeType === 'text/csv') {
      conteudoTexto = await new Promise((resolve, reject) => {
        const lines = [];
        fs.createReadStream(filePath)
          .pipe(csv())
          .on('data', (data) => lines.push(JSON.stringify(data)))
          .on('end', () => resolve(lines.slice(0, 200).join('\n'))) // Lê apenas 200 linhas de amostra para não estourar tokens
          .on('error', reject);
      });
    } else {
      throw new Error('Formato de arquivo não suportado. Envie PDF ou CSV.');
    }

    const prompt = `
O arquivo anexado tem o nome "${fileName}". Ele foi gerado pelo sistema Digifarma.
Eis uma amostra dos dados (pode estar truncado, veja as tendências gerais):

--- DADOS DO ARQUIVO ---
${conteudoTexto}
------------------------

TAREFA DA ISA-FINANCEIRO:
1. Identifique sobre o que é este relatório (É de Vendas? Contas a Pagar? Estoque?).
2. Faça um diagnóstico RÁPIDO: Quais os pontos críticos/fortes vistos nesta amostra?
3. Há indícios de furo de capital de giro, ou estoque girando mal? Alerte.
4. Traduza os números confusos do software de gestão para a realidade da "farmácia na rua".

Formato esperado: Curto e grosso, em markdown, estruturado de forma fácil de ler. 
`;

    return chamarGemini(prompt);

  } catch (err) {
    throw new Error('Falha ao usar a IA para ler o relatório: ' + err.message);
  } finally {
    // Delete file after reading
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

module.exports = {
  gerarPilulaEducacao,
  analisarFechamentoDeCaixa,
  analisarRelatorioDigifarma,
  ISA_FINANCE_SYSTEM_PROMPT
};
