const path = require('path');
const fs = require('fs');
const pdf = require('pdf-parse');
const db = require('../database');

/**
 * Marketing Agent Service — BelaFarma Sul
 * 
 * 🤖 ISA-MARKETING — Especialista em comunicação e tendências da belinha
 * 
 * Persona: "Vizinha especialista" — amigável, prestativa, focada em bem-estar.
 * Tom de voz: próximo, acolhedor, direto, moderadamente divertido.
 * Localidade: Juiz de Fora, Minas Gerais.
 * 
 * Responsabilidades:
 * - Curadoria de notícias (ANVISA, CRF-MG, portais de bem-estar)
 * - Trend Hunting (vídeos/áudios virais em farmácia/beleza)
 * - Engajamento ativo (lembretes, enquetes, alertas de clima JF)
 * - Fidelização (aniversários, ofertas personalizadas via Evolution API)
 * - Relatório semanal para Rosana
 */


// ─── System Prompt da Isa-Marketing ─────────────────────────────────────────

const ISA_SYSTEM_PROMPT = `
Você é a ISA-MARKETING, a especialista em comunicação e tendências da belinha em Juiz de Fora, Minas Gerais.

PERFIL:
Seu tom de voz é amigável, prestativo e focado em bem-estar. Você fala como uma "vizinha especialista": 
alguém em quem o cliente confia e que sempre tem uma dica de saúde na manga. Você conhece JF profundamente 
— a cultura mineira, os bairros, o clima da cidade, os eventos locais.

OBJETIVOS:
1. Curadoria de Notícias: Filtrar o que é relevante da ANVISA, CRF-MG e portais de bem-estar para os clientes e equipe
2. Trend Hunting: Identificar tendências virais no nicho de farmácia e beleza e sugerir adaptações
3. Engajamento Ativo: Criar lembretes de reposição, enquetes de saúde, alertas baseados no clima de JF
4. Fidelização: Gerenciar mensagens de aniversário e ofertas personalizadas

REGRAS DE COMUNICAÇÃO (WhatsApp):
- Use emojis de forma MODERADA para tornar o texto leve (não exagere)
- Use *negrito* para destacar pontos cruciais (nomes de remédios, datas, alertas)
- Seja CONCISA no WhatsApp — as pessoas não leem textos longos
- SEMPRE termine com uma pergunta ou convite para o cliente responder ou vir à loja (CTA)
- Mencione "composing" — suas mensagens devem parecer escritas por uma pessoa real
- Use o delay natural da digitação antes de enviar (já configurado via Evolution API)

LÓGICAS ESPECÍFICAS:
- Alerta de Reabastecimento: Se um cliente está no fim do tratamento, sugira recompra de forma gentil
- Notícias Técnicas: Traduza novidades técnicas (ANVISA, CRF-MG) para linguagem que um leigo entenda
- Filtro Regional: Priorize informações que impactem moradores de Juiz de Fora ou Minas Gerais
- Clima de JF: Adapte conteúdo ao clima da cidade (frio/calor/chuva → produtos relevantes)

FORMATAÇÃO DO RELATÓRIO:
- Use markdown com headers, emojis estratégicos e bullets
- Mensagens WhatsApp: texto simples, formatação do WhatsApp (*negrito*, _itálico_)
- Sempre identifique-se como Isa ao final das mensagens de teste
`;

/**
 * Busca as próximas datas comemorativas
 */
function getDatasComemorativasProximos(dias = 15) {
  const hoje = new Date();
  const limite = new Date(hoje);
  limite.setDate(hoje.getDate() + dias);

  const datas = [];

  for (const data of DATAS_COMEMORATIVAS) {
    const anoAtual = hoje.getFullYear();
    const candidatos = [
      new Date(anoAtual, data.mes - 1, data.dia),
      new Date(anoAtual + 1, data.mes - 1, data.dia),
    ];

    for (const candidato of candidatos) {
      if (candidato >= hoje && candidato <= limite) {
        const diasRestantes = Math.ceil((candidato - hoje) / (1000 * 60 * 60 * 24));
        datas.push({
          ...data,
          data: candidato.toISOString().split('T')[0],
          diasRestantes,
        });
        break;
      }
    }
  }

  return datas.sort((a, b) => a.diasRestantes - b.diasRestantes);
}

const DATAS_COMEMORATIVAS = [
  { mes: 1,  dia: 1,  nome: 'Ano Novo', emoji: '🎉', temas: ['saúde', 'bem-estar', 'novos hábitos'] },
  { mes: 2,  dia: 14, nome: 'Dia dos Namorados (Internacional)', emoji: '❤️', temas: ['cuidado pessoal', 'perfumaria', 'beleza'] },
  { mes: 3,  dia: 8,  nome: 'Dia Internacional da Mulher', emoji: '🌸', temas: ['saúde feminina', 'beleza', 'autocuidado'] },
  { mes: 3,  dia: 20, nome: 'Início do Outono', emoji: '🍂', temas: ['vitaminas', 'imunidade', 'hidratação'] },
  { mes: 4,  dia: 22, nome: 'Dia da Terra', emoji: '🌍', temas: ['produtos naturais', 'sustentabilidade'] },
  { mes: 5,  dia: 1,  nome: 'Dia do Trabalhador', emoji: '💪', temas: ['saúde', 'energia', 'suplementos'] },
  { mes: 6,  dia: 12, nome: 'Dia dos Namorados', emoji: '💑', temas: ['perfumaria', 'beleza', 'cuidado pessoal'] },
  { mes: 6,  dia: 21, nome: 'Início do Inverno', emoji: '❄️', temas: ['vitamina C', 'proteção gripe', 'hidratante lábios'] },
  { mes: 7,  dia: 25, nome: 'Dia do Farmacêutico', emoji: '💊', temas: ['saúde', 'medicamentos', 'cuidado'] },
  { mes: 8,  dia: 11, nome: 'Aniversário de Juiz de Fora', emoji: '🏙️', temas: ['orgulho local', 'comunidade', 'JF'] },
  { mes: 9,  dia: 7,  nome: 'Dia da Independência', emoji: '🇧🇷', temas: ['orgulho', 'saúde', 'família'] },
  { mes: 9,  dia: 20, nome: 'Dia da Primavera', emoji: '🌸', temas: ['alergias', 'antialérgicos', 'protetor solar'] },
  { mes: 10, dia: 1,  nome: 'Dia Mundial da Saúde Mental', emoji: '🧠', temas: ['bem-estar', 'suplementos', 'relaxamento'] },
  { mes: 10, dia: 12, nome: 'Dia das Crianças', emoji: '🧸', temas: ['saúde infantil', 'vitaminas infantis'] },
  { mes: 10, dia: 31, nome: 'Halloween', emoji: '🎃', temas: ['bem-estar', 'produtos naturais'] },
  { mes: 11, dia: 15, nome: 'Proclamação da República', emoji: '🇧🇷', temas: ['feriado', 'promoção especial'] },
  { mes: 12, dia: 1,  nome: 'Dia Mundial de Luta contra a AIDS', emoji: '🎗️', temas: ['saúde', 'prevenção'] },
  { mes: 12, dia: 25, nome: 'Natal', emoji: '🎄', temas: ['família', 'cuidado', 'presentes', 'saúde'] },
  { mes: 12, dia: 31, nome: 'Réveillon', emoji: '🎆', temas: ['novos começos', 'saúde', 'bem-estar'] },
];

/**
 * Utilitários de Cache para IA
 */
function getAICache(key) {
  try {
    const row = db.prepare('SELECT value, expires_at FROM ai_cache WHERE key = ?').get(key);
    if (!row) return null;
    
    const expiresAt = new Date(row.expires_at);
    if (expiresAt < new Date()) {
      return { value: row.value, expired: true };
    }
    
    return { value: row.value, expired: false };
  } catch (error) {
    console.error('[IsaMarketing] Erro ao ler cache de IA:', error);
    return null;
  }
}

function putAICache(key, value, ttlSeconds = 3600) {
  try {
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + ttlSeconds);
    
    db.prepare('INSERT OR REPLACE INTO ai_cache (key, value, expires_at) VALUES (?, ?, ?)')
      .run(key, value, expiresAt.toISOString());
  } catch (error) {
    console.error('[IsaMarketing] Erro ao salvar cache de IA:', error);
  }
}

async function chamarGemini(prompt, systemNote = '', cacheKey = null, ttl = 3600) {
  // 1. Tentar ler do cache se houver uma chave
  if (cacheKey) {
    const cached = getAICache(cacheKey);
    if (cached && !cached.expired) {
      console.log(`[IsaMarketing] 📥 Usando cache válido para: ${cacheKey}`);
      return cached.value;
    }
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    throw new Error('A chave da API (GEMINI_API_KEY) não está sendo identificada.');
  }

  const GEMINI_MODEL = 'gemini-1.5-flash-latest';
  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  console.log(`[IsaMarketing] 🚀 Chamando Gemini: ${GEMINI_MODEL}`);
  
  const promptCompleto = `${ISA_SYSTEM_PROMPT}\n\n${systemNote ? `CONTEXTO ADICIONAL:\n${systemNote}\n\n` : ''}TAREFA:\n${prompt}`;

  try {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptCompleto }] }],
        generationConfig: {
          temperature: 0.9,
          topP: 0.95,
          maxOutputTokens: 8192,
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[IsaMarketing] Erro Gemini (${response.status}):`, errText);
      
      if (response.status === 429 && cacheKey) {
        const cached = getAICache(cacheKey);
        if (cached) {
          console.warn(`[IsaMarketing] ⚠️ Quota excedida. Usando cache expirado para: ${cacheKey}`);
          return cached.value;
        }
      }
      
      throw new Error(`Gemini API error ${response.status}`);
    }

    const data = await response.json();
    const result = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    if (cacheKey && result) {
      putAICache(cacheKey, result, ttl);
    }
    
    return result;
  } catch (error) {
    console.error('[IsaMarketing] Erro ao chamar IA:', error.message);
    
    if (cacheKey) {
      const cached = getAICache(cacheKey);
      if (cached) {
        console.warn(`[IsaMarketing] ⚠️ Erro na IA. Usando fallback de cache para: ${cacheKey}`);
        return cached.value;
      }
    }
    throw error;
  }
}

/**
 * Gera o relatório completo dos próximos 15 dias
 */
async function gerarRelatorioCompleto(db) {
  console.log('[IsaMarketing] 🤖 Iniciando geração do relatório da Isa...');

  let produtosEncalhados = [];
  let totalProdutos = 0;

  try {
    const fogueteItems = db.prepare(`
      SELECT 
        ii.product_name as nome,
        ii.product_code as codigo,
        SUM(ii.quantity_remaining) as saldo_restante,
        MIN(ii.unit_cost) as custo_unitario,
        i.supplier_name as fornecedor
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE ii.quantity_remaining > 0
      GROUP BY ii.product_code
      ORDER BY saldo_restante DESC
      LIMIT 15
    `).all();

    if (fogueteItems && fogueteItems.length > 0) {
      produtosEncalhados = fogueteItems.map(p => ({
        nome: p.nome, codigo: p.codigo,
        estoque: p.saldo_restante, fornecedor: p.fornecedor,
      }));
      totalProdutos = fogueteItems.length;
    }
  } catch (e) {
    console.log('[IsaMarketing] Módulo Foguete Amarelo não disponível, usando dados genéricos');
  }

  const datas = getDatasComemorativasProximos(15);
  const agora = new Date();
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const dataAtual = `${agora.getDate()} de ${meses[agora.getMonth()]} de ${agora.getFullYear()}`;

  const dataFim = new Date(agora);
  dataFim.setDate(agora.getDate() + 14);
  const dataFimStr = `${dataFim.getDate()} de ${meses[dataFim.getMonth()]}`;

  const produtosSection = produtosEncalhados.length > 0
    ? produtosEncalhados.slice(0, 10).map((p, i) =>
        `${i+1}. **${p.nome}** — ${p.estoque} unidades no estoque`
      ).join('\n')
    : 'Vitaminas, protetor solar, medicamentos OTC, produtos de beleza, suplementos, antigripais';

  const datasSection = datas.length > 0
    ? datas.map(d =>
        `${d.emoji} **${d.nome}** — ${d.data} (em ${d.diasRestantes} dias) | Produtos: ${d.temas.join(', ')}`
      ).join('\n')
    : '(Nenhuma data comemorativa especial nesta quinzena — foque em promoções do dia a dia)';

  const prompt = `DATA DO RELATÓRIO: ${dataAtual}
PERÍODO DE COBERTURA: ${dataAtual} a ${dataFimStr}
CIDADE: Juiz de Fora, MG

PRODUTOS COM ESTOQUE PARADO:
${produtosSection}

DATAS COMEMORATIVAS NOS PRÓXIMOS 15 DIAS:
${datasSection}

---

Gere o RELATÓRIO ESTRATÉGICO COMPLETO da Isa-Marketing no seguinte formato conforme descrito no manual.`;

  console.log('[IsaMarketing] 🧠 Chamando Gemini...');
  const cacheKey = `relatorio_completo_${agora.toISOString().split('T')[0]}`;
  const relatorio = await chamarGemini(prompt, '', cacheKey, 86400); // 24h
  console.log('[IsaMarketing] ✅ Relatório da Isa gerado com sucesso!');

  return {
    relatorio,
    metadata: {
      geradoEm: new Date().toISOString(),
      totalProdutos,
      totalDatas: datas.length,
      datas: datas.map(d => d.nome),
    }
  };
}

async function gerarIdeiasProduto(produto) {
  const prompt = `PRODUTO: ${produto.nome}
CATEGORIA: ${produto.categoria || 'farmácia'}
Como a Isa-Marketing, crie 3 ideias CRIATIVAS de promoção para este produto em JF.`;

  const cacheKey = `ideias_produto_${produto.nome.toLowerCase().replace(/\s+/g, '_')}`;
  return chamarGemini(prompt, '', cacheKey, 604800); // 7 dias
}

async function gerarCuradoriaNoticas() {
  const prompt = `Como a Isa-Marketing de JF, simule 5 notícias recentes relevantes do setor de saúde.`;

  const dataHoje = new Date().toISOString().split('T')[0];
  const cacheKey = `curadoria_noticias_${dataHoje}`;
  return chamarGemini(prompt, '', cacheKey, 86400); // 24h
}

async function gerarTrendHunting() {
  const prompt = `Como a Isa-Marketing, faça um "Trend Hunting" para a Bela Farma Sul de JF.`;

  const dataHoje = new Date().toISOString().split('T')[0];
  const cacheKey = `trend_hunting_${dataHoje}`;
  return chamarGemini(prompt, '', cacheKey, 86400); // 24h
}

async function buscarClimaReal(lat = -21.78, lon = -43.34) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=temperature_2m,relativehumidity_2m,precipitation_probability&timezone=America%2FSao_Paulo`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Falha ao buscar clima');
    return await response.json();
  } catch (error) {
    console.error('[IsaMarketing] Erro ao buscar clima real:', error);
    return null;
  }
}

async function gerarAlertaClima(clima) {
  const prompt = `Clima atual em Juiz de Fora: ${clima}
Como a Isa-Marketing, crie uma mensagem de WhatsApp e Story com dica de saúde.`;

  const cacheKey = `alerta_clima_${clima.substring(0, 30).toLowerCase().replace(/\s+/g, '_')}`;
  return chamarGemini(prompt, '', cacheKey, 7200); // 2h
}

async function gerarRelatorioClimaIpiranga(dadosClima) {
  const current = dadosClima?.current_weather;
  const temp = current?.temperature;
  const code = current?.weathercode;
  
  const interpretacao = {
    0: 'Céu limpo ☀️', 1: 'Principalmente limpo 🌤️', 2: 'Parcialmente nublado ⛅', 3: 'Nublado ☁️',
    45: 'Nevoeiro 🌫️', 51: 'Drizzle leve 🌦️', 61: 'Chuva leve 🌧️', 80: 'Pancadas de chuva ⛈️', 95: 'Tempestade ⚡'
  };

  const climaHumano = `${temp}°C - ${interpretacao[code] || 'Variável'}`;

  const prompt = `SISTEMA: Conteúdo para o BAIRRO IPIRANGA, em JF.
CLIMA ATUAL: ${climaHumano}
Tarefa: Previsão, Dica de Saúde, Ideia de Post e WhatsApp.`;

  const cacheKey = `clima_ipiranga_${temp}_${code}`;
  return chamarGemini(prompt, '', cacheKey, 14400); // 4h
}

function formatarResumoWhatsApp(relatorio, metadata) {
  const agora = new Date();
  const formatData = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  
  return `🌟 *RELATÓRIO ISA-MARKETING* 🌟\n📍 Bela Farma Sul\n📊 Período: *${formatData(agora)}*\n\n${relatorio.substring(0, 500)}...`;
}

async function gerarMensagemClimaDiaria() {
  const climaRaw = await buscarClimaReal();
  if (!climaRaw) return null;

  const current = climaRaw.current_weather;
  const temp = current.temperature;
  const code = current.weathercode;

  const interpretacao = {
    0: 'Céu limpo ☀️', 1: 'Principalmente limpo 🌤️', 2: 'Parcialmente nublado ⛅', 3: 'Nublado ☁️',
    45: 'Nevoeiro 🌫️', 51: 'Drizzle leve 🌦️', 61: 'Chuva leve 🌧️', 80: 'Pancadas de chuva ⛈️', 95: 'Tempestade ⚡'
  };

  const climaHumano = `${temp}°C - ${interpretacao[code] || 'Variável'}`;

  const prompt = `Como a Isa-Marketing da Bela Farma Sul, escreva uma mensagem de WhatsApp para a Rosana (minha chefe) informando o clima de hoje em Juiz de Fora (${climaHumano}) e sugerindo uma pauta ou dica rápida de saúde para postar nas redes sociais da farmácia hoje. Seja amigável e proativa.`;

  return chamarGemini(prompt, '', `clima_diario_rosana_${new Date().toISOString().split('T')[0]}`, 14400);
}

async function analisarProdutosParados90Dias(db, phone = process.env.EDEVALDO_WHATSAPP) {
  const reportsDir = path.join(__dirname, '../reports/digifarma');
  if (!fs.existsSync(reportsDir)) return null;

  const files = fs.readdirSync(reportsDir).filter(f => f.endsWith('.pdf'));
  let targetFile = null;

  // Busca o arquivo mais recente que contenha o texto de venda parada
  // Para performance, verificamos os 5 mais recentes
  const sortedFiles = files.map(f => ({
    name: f,
    mtime: fs.statSync(path.join(reportsDir, f)).mtime
  })).sort((a, b) => b.mtime - a.mtime).slice(0, 5);

  for (const fileObj of sortedFiles) {
    const buf = fs.readFileSync(path.join(reportsDir, fileObj.name));
    const parser = new pdf.PDFParse(new Uint8Array(buf));
    try {
      await parser.load();
      const data = await parser.getText();
      const text = (data.text || '').toLowerCase();
      
      // Busca por palavras-chave que identifiquem o relatório de venda parada
      const keywords = ['90 dias', 'venda parada', 'não vende', 'produto parado', 'sem venda'];
      const isTarget = keywords.some(k => text.includes(k));

      if (isTarget) {
        targetFile = { name: fileObj.name, content: data.text };
        break;
      }
    } catch (e) {
      console.error(`[IsaMarketing] Erro ao ler PDF ${fileObj.name}:`, e.message);
    }
  }

  if (!targetFile) {
    console.warn('[IsaMarketing] Relatório de venda parada não encontrado nos arquivos recentes.');
    return null;
  }

  // Buscar produtos já sugeridos para evitar repetição
  const sugeridos = db ? db.prepare('SELECT productName FROM marketing_suggestions_history').all().map(r => r.productName) : [];

  const prompt = `RELATÓRIO DE PRODUTOS PARADOS (Últimos 90 dias):\n${targetFile.content.substring(0, 5000)}\n\n
  PRODUTOS JÁ TRABALHADOS (NÃO SELECIONE ESTES): ${sugeridos.join(', ')}

  TAREFA: Como a Belinha (especialista em marketing da Bela Farma Sul), identifique 10 produtos DESTA LISTA (que não estejam nos já trabalhados) que merecem atenção IMEDIATA.
  
  PERSONA E ESTILO:
  - Use o nome "Belinha".
  - Seja extremamente próxima, amigável e profissional com o Edevaldo.
  - Use gírias e referências de Juiz de Fora/JF (Rio Branco, lanche no Calçadão, mormaço da serra, ladeiras, etc).
  - Use emojis e formatação Markdown atraente (negrito, itálico).
  - Metáfora: Produtos parados são "inquilinos que não pagam aluguel".
  
  ESTRUTURA DA MENSAGEM (friendlyMessage):
  1. Abertura calorosa mencionando o clima de JF e o estoque.
  2. Seção "📋 Plano de Ação: Limpa Estoque (90 dias+)" com os 10 itens numerados.
     Cada item deve ter: *Nome do Produto (Cód)*, *Promoção* (pense em nomes criativos) e *Ação* (estratégia de venda no balcão ou loja).
  3. Seção "📲 Sugestão de Mensagem para Clientes (WhatsApp)" com um modelo de texto pronto para o Edevaldo copiar e enviar.
  4. Fechamento perguntando o que ele acha e pedindo o "ok".

  FORMATO DE RESPOSTA (OBRIGATÓRIO):
  Sua resposta deve ser um JSON válido contendo:
  1. "friendlyMessage": A mensagem completa descrita acima, formatada para WhatsApp (com quebras de linha \n).
  2. "suggestions": Um array de objetos para criar as tarefas no sistema, onde cada objeto tem:
     - "productName": Nome do produto
     - "action": Resumo curto da Promoção + Ação de venda (máx 200 caracteres)
  
  Mantenha o JSON rigorosamente válido.`;

  const respostaRaw = await chamarGemini(prompt, 'Responda APENAS com o JSON estruturado.', `analise_mkt_json_${new Date().toISOString().split('T')[0]}`, 86400);
  
  try {
     // Regex mais robusto para extrair apenas o JSON
     const jsonMatch = respostaRaw.match(/\{[\s\S]*\}/);
     const cleanJson = jsonMatch ? jsonMatch[0] : respostaRaw;
     const data = JSON.parse(cleanJson);
     
     if (db && data.suggestions) {
       // Salvar para aprovação
       const pendingId = `pending_mkt_${Date.now()}`;
       db.prepare(`
         INSERT INTO nayane_pending_approvals (id, phone, suggestionsJson, status, createdAt)
         VALUES (?, ?, ?, ?, ?)
       `).run(pendingId, phone || process.env.EDEVALDO_WHATSAPP || process.env.ADMIN_WHATSAPP, JSON.stringify(data.suggestions), 'Pendente', new Date().toISOString());

       // Registrar no histórico para não repetir
       for (const sug of data.suggestions) {
         db.prepare(`
           INSERT OR IGNORE INTO marketing_suggestions_history (id, productName, suggestedAction, suggestedAt)
           VALUES (?, ?, ?, ?)
         `).run(`hist_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, sug.productName, sug.action, new Date().toISOString());
       }
     }

     return data.friendlyMessage + "\n\nResponda com *ok* para criar as tarefas automaticamente! 👍";
  } catch (e) {
     console.error('[IsaMarketing] Falha ao processar JSON da IA:', e.message);
     return respostaRaw; // Fallback se não for JSON
  }
}

module.exports = {
  gerarRelatorioCompleto,
  gerarIdeiasProduto,
  gerarCuradoriaNoticas,
  gerarTrendHunting,
  gerarAlertaClima,
  buscarClimaReal,
  gerarRelatorioClimaIpiranga,
  formatarResumoWhatsApp,
  getDatasComemorativasProximos,
  gerarMensagemClimaDiaria,
  analisarProdutosParados90Dias,
  DATAS_COMEMORATIVAS,
  ISA_SYSTEM_PROMPT,
};
