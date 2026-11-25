const path = require('path');
const fs = require('fs');
const { PDFParse } = require('pdf-parse');
const db = require('../database');
const { callAI } = require('./ai.service');

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

async function chamarIA(prompt, systemNote = '', cacheKey = null, ttl = 3600) {
  // 1. Tentar ler do cache se houver uma chave
  if (cacheKey) {
    const cached = getAICache(cacheKey);
    if (cached && !cached.expired) {
      console.log(`[IsaMarketing] 📥 Usando cache válido para: ${cacheKey}`);
      return cached.value;
    }
  }

  const systemPrompt = `${ISA_SYSTEM_PROMPT}\n\n${systemNote ? `CONTEXTO ADICIONAL:\n${systemNote}` : ''}`;

  try {
    const result = await callAI(prompt, systemPrompt, { temperature: 0.9 });
    
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
  const relatorio = await chamarIA(prompt, '', cacheKey, 86400); // 24h
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
  return chamarIA(prompt, '', cacheKey, 604800); // 7 dias
}

async function gerarCuradoriaNoticas() {
  const agora = new Date();
  const hora = agora.getHours();
  let periodo = 'manhã';
  if (hora >= 12 && hora < 18) periodo = 'tarde';
  if (hora >= 18) periodo = 'noite';

  const prompt = `Você é a ISA-MARKETING, a voz da Bela Farma Sul em Juiz de Fora.
Gere um roteiro de NOTÍCIAS RÁPIDAS para a rádio interna da farmácia (período da ${periodo}).

CONTEÚDO OBRIGATÓRIO:
1. JUIZ DE FORA: Destaque algo importante da cidade hoje (clima, trânsito ou evento).
2. BRASIL E MUNDO: As 2 notícias mais impactantes do momento.
3. ECONOMIA E VAREJO: Algo sobre preços, dólar ou dicas de economia para o consumidor.
4. SAÚDE: Uma novidade da ANVISA, dica de prevenção ou curiosidade sobre bem-estar.

REGRAS:
- Tom de voz de rádio: dinâmico, amigável e direto.
- Inicie com: "Olá amigos da Bela Farma! Aqui é a Isa com o nosso giro de notícias para começar bem a sua ${periodo}."
- Termine com uma dica de saúde e um convite: "Bela Farma Sul, cuidando sempre de você. Uma ótima ${periodo}!".
- O texto total deve ter entre 1 e 2 minutos de fala (aprox. 150-200 palavras).
- EXTREMAMENTE IMPORTANTE: Não use NENHUM emoji. Não use formatação markdown (sem asteriscos, sem negrito, sem hashtags). O texto deve ser 100% limpo, apenas texto puro e pontuação básica para ser lido em voz alta por um sistema de áudio.`;

  const dataHoje = agora.toISOString().split('T')[0];
  const cacheKey = `curadoria_noticias_${dataHoje}_${periodo}_v2`;
  return chamarIA(prompt, 'Responda apenas com o texto puro e limpo para o TTS da rádio, sem emojis ou marcações.', cacheKey, 14400); // 4h
}

async function gerarTrendHunting() {
  const prompt = `Como a Isa-Marketing, faça um "Trend Hunting" para a Bela Farma Sul de JF.`;

  const dataHoje = new Date().toISOString().split('T')[0];
  const cacheKey = `trend_hunting_${dataHoje}`;
  return chamarIA(prompt, '', cacheKey, 86400); // 24h
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
  return chamarIA(prompt, '', cacheKey, 7200); // 2h
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
  return chamarIA(prompt, '', cacheKey, 14400); // 4h
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

  return chamarIA(prompt, '', `clima_diario_rosana_${new Date().toISOString().split('T')[0]}`, 14400);
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
    try {
      const buf = fs.readFileSync(path.join(reportsDir, fileObj.name));
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      const result = await parser.getText();
      const text = (result.text || '').toLowerCase();
      
      // Busca por palavras-chave que identifiquem o relatório de venda parada
      const keywords = ['90 dias', 'venda parada', 'não vende', 'produto parado', 'sem venda'];
      const isTarget = keywords.some(k => text.includes(k));

      if (isTarget) {
        targetFile = { name: fileObj.name, content: result.text };
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

  const respostaRaw = await chamarIA(prompt, 'Responda APENAS com o JSON estruturado.', `analise_mkt_json_${new Date().toISOString().split('T')[0]}`, 86400);
  
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

/**
 * Interpreta o retorno do Open-Meteo em descrição humana para pauta de JF.
 */
function interpretarClimaIpiranga(dadosClima) {
  const current = dadosClima?.current_weather;
  if (!current || typeof current.temperature !== 'number') {
    return 'Clima variável na Zona Sul de Juiz de Fora';
  }
  const interpretacao = {
    0: 'Céu limpo',
    1: 'Principalmente limpo',
    2: 'Parcialmente nublado',
    3: 'Nublado',
    45: 'Nevoeiro',
    51: 'Garoa leve',
    61: 'Chuva leve',
    80: 'Pancadas de chuva',
    95: 'Tempestade',
  };
  return `${Math.round(current.temperature)}°C — ${interpretacao[current.weathercode] || 'Tempo variável'} (Ipiranga/JF)`;
}

/**
 * Fallback determinístico para garantir que o calendário semanal nunca falhe na UI.
 */
function criarFallbackPlanoSocial({ focusTheme, climateContext, config, datas }) {
  const ig = config.instagramHandle || '@belafarmasul';
  const whats = config.whatsappDisplay || '(32) 99822-8189';
  const dataProxima = datas?.[0] ? `${datas[0].nome} (${datas[0].data})` : 'Rotina de cuidados no Ipiranga';
  const foco = focusTheme || `Clima de JF (${climateContext}) + Recompra no Bairro`;

  return {
    temaSemana: focusTheme ? `Semana Especial: ${focusTheme}` : `Cuidado Inteligente no Ipiranga • ${dataProxima}`,
    resumoEstrategico: `Pauta no Ritmo Sustentável (~2h/sem) equilibrando autoridade em saúde preventiva (${climateContext}), dermocosméticos/infantil e conversão local para WhatsApp ${whats} e Cartão Brasil Card.`,
    postsFeed: [
      {
        id: 'post_1',
        dia: 'Terça-feira',
        formato: 'Reels (30-45s com equipe)',
        pilar: 'Saúde & Clima JF',
        titulo: '3 cuidados simples para enfrentar a virada de tempo em Juiz de Fora',
        gancho3s: 'Morador do Ipiranga, o tempo em JF virou de novo e o nariz já sentiu?',
        roteiroOuSlides: '0-3s: Colaborador(a) na prateleira fazendo a pergunta do gancho. 3-30s: Mostrar 3 aliados permitidos (soro fisiológico para lavagem nasal, hidratante labial e vitamina C/hidratação). 30-42s: Convidar para falar com nossa equipe no WhatsApp ou pedir entrega grátis.',
        legenda: `Em Juiz de Fora a gente sabe: sai de casa com sol e volta com friozinho! 🌦️\n\nPor isso separamos 3 cuidados diários simples para proteger o bem-estar da família sem complicação.\n\n📲 Precisa hoje? Chama no link da bio (${ig}) ou no WhatsApp ${whats} — entrega super rápida e grátis nos bairros próximos!`,
        cta: 'Clique no link da bio e peça pelo WhatsApp com entrega grátis',
        hashtags: ['#BelaFarmaSul', '#IpirangaJF', '#JuizDeFora', '#SaudeJF', '#ZonaSulJF'],
        alertaAnvisa: 'Conteúdo educativo de prevenção e higiene/suplementação. Não citar medicamentos tarjados nem indicar automedicação.',
      },
      {
        id: 'post_2',
        dia: 'Quinta-feira',
        formato: 'Carrossel salvável (4-6 cards)',
        pilar: 'Dermocosméticos & Skincare',
        titulo: 'Rotina básica de skincare em 4 passos (sem gastar à toa)',
        gancho3s: 'Salve este guia para nunca mais errar a ordem dos cuidados com a pele!',
        roteiroOuSlides: 'Card 1: Capa chamativa "4 passos simples de skincare no clima de JF". Card 2: Limpeza suave sem ressecar. Card 3: Hidratação certa para pele oleosa ou seca. Card 4: Protetor solar todo dia (mesmo nublado). Card 5: CTA para tirar dúvidas com a equipe e ver opções na loja.',
        legenda: `Cuidar da pele não precisa ser caro nem demorado ✨\n\nSalve este carrossel para consultar na sua rotina e mande para quem mora aqui na Zona Sul de JF! Se quiser ajuda para escolher o hidratante ou protetor ideal pro seu tipo de pele, chama a gente no link da bio.\n\n💳 Aceitamos Cartão Brasil Card, Pix e cartões!`,
        cta: 'Salve o post e tire dúvidas sobre seu tipo de pele no link da bio',
        hashtags: ['#SkincareJF', '#Dermocosmeticos', '#BelaFarmaSul', '#IpirangaJF', '#BelezaJF'],
        alertaAnvisa: 'Permitido para cosméticos e dermocosméticos. Evite prometer resultados milagrosos ou tratamentos dermatológicos médicos.',
      },
      {
        id: 'post_3',
        dia: 'Sexta-feira',
        formato: 'Post / Reels Comercial (mãos/prateleira)',
        pilar: 'Entrega Grátis + Infantil/Fraldas + Cartão Brasil Card',
        titulo: 'Fraldas, higiene e perfumaria no Cartão Brasil Card com entrega grátis',
        gancho3s: 'Acabou a fralda ou item de higiene em casa? Não precisa nem sair do Ipiranga!',
        roteiroOuSlides: '0-3s: Mãos segurando pacote de fraldas/combo de higiene e sacola da Bela Farma Sul. 3-25s: Mostrar praticidade do pedido via WhatsApp e Vitrine Digital, destacando entrega super rápida e grátis nos bairros próximos e pagamento no Cartão Brasil Card.',
        legenda: `Foco da semana: ${foco} 🚀\n\nAqui na Bela Farma Sul você resolve fraldas, cuidados do bebê, perfumaria e itens do dia a dia sem sair de casa!\n\n🛵 Entrega super rápida e grátis nos bairros próximos\n💳 Aceitamos Cartão Brasil Card, Pix, crédito/débito e dinheiro\n👇 Acesse nossa Vitrine de Ofertas ou peça no WhatsApp pelo link da bio (${ig})!`,
        cta: 'Toque no link da bio para abrir o WhatsApp ou a Vitrine de Ofertas',
        hashtags: ['#CartaoBrasilCard', '#EntregaGratisJF', '#FraldasJF', '#BelaFarmaSul', '#IpirangaJF'],
        alertaAnvisa: 'Exibir somente itens isentos de prescrição, fraldas, perfumaria e serviços da loja (proibido preço/promoção de tarjados).',
      },
    ],
    stories: [
      { dia: 'Segunda', ideia: `Bom dia Ipiranga com previsão real (${climateContext}) + foto do balcão aberto desde 07h30`, cta: 'Caixinha/link para pedir no WhatsApp' },
      { dia: 'Terça', ideia: 'Bastidor da gravação do Reels + enquete "Você já teve mudança de tempo que atacou a rinite hoje? Sim / Com certeza"', cta: 'Arraste/toque para ver o Reels no feed' },
      { dia: 'Quarta', ideia: '3 produtos da Vitrine Digital (beleza, infantil ou vitaminas) mostrando preço e entrega grátis', cta: 'Sticker de link para /promocao ou /bio' },
      { dia: 'Quinta', ideia: 'Foto real de sacola saindo para entrega + reforço de que aceitamos Cartão Brasil Card', cta: 'Link direto do WhatsApp com entrega grátis' },
      { dia: 'Sexta', ideia: 'Seleção fim de semana (protetor solar, perfumaria e linha bebê) + horário de sábado e domingo', cta: 'Link da bio para fechar pedido antes das 20h' },
    ],
    googlePerfil: {
      titulo: 'Entrega Grátis no Ipiranga e Cartão Brasil Card — Bela Farma Sul',
      texto: `Precisando de fraldas, dermocosméticos, vitaminas ou itens de cuidado diário em Juiz de Fora? A Bela Farma Sul atende ${config.openingHours || 'Seg–Sáb 07h30–20h e Dom 07h30–13h'} com entrega super rápida e grátis nos bairros próximos e aceita Cartão Brasil Card! Chame no WhatsApp ${whats}.`,
      ctaBotao: 'Pedir no WhatsApp / Ver Vitrine',
    },
    sugestaoTrafegoPago: {
      objetivo: 'Mensagens no WhatsApp ou Tráfego para /bio (60% da verba) + Visitas ao Perfil com o Reels de Terça (40%)',
      publico: 'Raio 2–5 km do Bairro Ipiranga (Ipiranga, Santa Luzia, São Mateus, Cascatinha, Teixeiras, Zona Sul JF)',
      verbaSugerida: `R$ ${Math.max(10, Math.round((Number(config.monthlyAdBudget) || 450) / 30))}/dia (~R$ ${Number(config.monthlyAdBudget) || 450}/mês)`,
      ideiaCriativo: 'Impulsionar o post de sexta (Entrega Grátis + Cartão Brasil Card + Infantil/Beleza) para WhatsApp e o Reels de terça para Visitas ao Perfil.',
    },
    climateContext,
    fallback: true,
  };
}

/**
 * Normaliza o JSON retornado pela IA garantindo todos os campos esperados pela interface.
 */
function normalizarPlanoSocial(raw, fallbackPlan) {
  if (!raw || typeof raw !== 'object') return fallbackPlan;

  const postsRaw = Array.isArray(raw.postsFeed) ? raw.postsFeed : [];
  const postsFeed = [0, 1, 2].map((idx) => {
    const p = postsRaw[idx] || {};
    const fb = fallbackPlan.postsFeed[idx];
    return {
      id: String(p.id || fb.id),
      dia: String(p.dia || fb.dia),
      formato: String(p.formato || fb.formato),
      pilar: String(p.pilar || fb.pilar),
      titulo: String(p.titulo || fb.titulo),
      gancho3s: String(p.gancho3s || fb.gancho3s),
      roteiroOuSlides: String(p.roteiroOuSlides || fb.roteiroOuSlides),
      legenda: String(p.legenda || fb.legenda),
      cta: String(p.cta || fb.cta),
      hashtags: Array.isArray(p.hashtags) && p.hashtags.length > 0
        ? p.hashtags.slice(0, 8).map(h => String(h).startsWith('#') ? String(h) : `#${String(h).replace(/\s+/g, '')}`)
        : fb.hashtags,
      alertaAnvisa: String(p.alertaAnvisa || fb.alertaAnvisa),
    };
  });

  const storiesRaw = Array.isArray(raw.stories) ? raw.stories : [];
  const stories = [0, 1, 2, 3, 4].map((idx) => {
    const s = storiesRaw[idx] || {};
    const fb = fallbackPlan.stories[idx];
    return {
      dia: String(s.dia || fb.dia),
      ideia: String(s.ideia || fb.ideia),
      cta: String(s.cta || fb.cta),
    };
  });

  const gp = raw.googlePerfil && typeof raw.googlePerfil === 'object' ? raw.googlePerfil : {};
  const tp = raw.sugestaoTrafegoPago && typeof raw.sugestaoTrafegoPago === 'object' ? raw.sugestaoTrafegoPago : {};

  return {
    temaSemana: String(raw.temaSemana || fallbackPlan.temaSemana),
    resumoEstrategico: String(raw.resumoEstrategico || fallbackPlan.resumoEstrategico),
    postsFeed,
    stories,
    googlePerfil: {
      titulo: String(gp.titulo || fallbackPlan.googlePerfil.titulo),
      texto: String(gp.texto || fallbackPlan.googlePerfil.texto),
      ctaBotao: String(gp.ctaBotao || fallbackPlan.googlePerfil.ctaBotao),
    },
    sugestaoTrafegoPago: {
      objetivo: String(tp.objetivo || fallbackPlan.sugestaoTrafegoPago.objetivo),
      publico: String(tp.publico || fallbackPlan.sugestaoTrafegoPago.publico),
      verbaSugerida: String(tp.verbaSugerida || fallbackPlan.sugestaoTrafegoPago.verbaSugerida),
      ideiaCriativo: String(tp.ideiaCriativo || fallbackPlan.sugestaoTrafegoPago.ideiaCriativo),
    },
    climateContext: fallbackPlan.climateContext,
    fallback: false,
  };
}

/**
 * Gera a pauta semanal completa de Crescimento Social (Ritmo Sustentável) com trava de compliance ANVISA/CRF-MG.
 */
async function gerarCalendarioSemanalSocial(config = {}, options = {}) {
  const focusTheme = String(options.focusTheme || '').trim();
  const weekLabel = String(options.weekLabel || '').trim();

  let dadosClima = null;
  try {
    dadosClima = await buscarClimaReal();
  } catch (e) {
    console.warn('[IsaMarketing] Clima indisponível para pauta social:', e.message);
  }
  const climateContext = interpretarClimaIpiranga(dadosClima);
  const datas = getDatasComemorativasProximos(14);

  const fallbackPlan = criarFallbackPlanoSocial({ focusTheme, climateContext, config, datas });

  const ig = config.instagramHandle || '@belafarmasul';
  const whats = config.whatsappDisplay || '(32) 99822-8189';
  const budget = Number(config.monthlyAdBudget) || 450;
  const datasTxt = datas.length > 0
    ? datas.map(d => `${d.nome} (${d.data})`).join(', ')
    : 'Nenhuma data especial nos próximos 14 dias';

  const prompt = `Você é a ISA-MARKETING da Drogaria Bela Farma Sul (Bairro Ipiranga, Juiz de Fora - MG).
Crie a PAUTA SEMANAL DE REDES SOCIAIS no modelo "Ritmo Sustentável (~2h/semana, Híbrido Leve)".

DADOS DA LOJA:
- Instagram: ${ig}
- WhatsApp: ${whats}
- Endereço: ${config.storeAddress || 'Bairro Ipiranga, Juiz de Fora - MG'}
- Horário: ${config.openingHours || 'Seg–Sáb 07h30 às 20h • Dom 07h30 às 13h'}
- Pagamentos: ${config.paymentsText || 'Cartão Brasil Card • Pix • Crédito/Débito • Dinheiro'}
- Verba mensal de tráfego pago hiperlocal: R$ ${budget}/mês (raio 2-5 km do Ipiranga/Zona Sul JF)
- Clima atual em Ipiranga/JF: ${climateContext}
- Próximas datas (14 dias): ${datasTxt}
- Semana / Foco solicitado: ${weekLabel || 'Semana atual'} ${focusTheme ? `| FOCO: ${focusTheme}` : ''}

5 PILARES CARROS-CHEFE DA BELA FARMA SUL (distribuir na semana):
1. Entrega super rápida e grátis nos bairros próximos + atendimento humano no WhatsApp
2. Saúde, vitaminas, imunidade e dicas do farmacêutico (prevenção + clima de JF)
3. Infantil, mamãe/bebê e fraldas
4. Dermocosméticos, skincare, perfumaria e beleza
5. Cartão Brasil Card (facilidade de pagamento local)

REGRAS OBRIGATÓRIAS DE COMPLIANCE ANVISA (RDC 96/2008) & CRF-MG:
- PROIBIDO sugerir preços, promoções ou anúncios de medicamentos tarjados (tarja vermelha ou preta / controlados).
- PROIBIDO incentivar automedicação ou prometer cura ("elimina a dor", "cura gripe").
- Em posts de saúde, focar exclusivamente em prevenção, hidratação, bem-estar, higiene, vitaminas/suplementos, dermocosméticos, itens infantis e orientação presencial/WhatsApp com a equipe farmacêutica.

ESTRUTURA OBRIGATÓRIA (responda APENAS JSON válido sem markdown):
{
  "temaSemana": "Título curto da semana",
  "resumoEstrategico": "Resumo de 2 frases explicando o equilíbrio da semana",
  "postsFeed": [
    {
      "id": "post_1",
      "dia": "Terça-feira",
      "formato": "Reels (30-45s com equipe)",
      "pilar": "Nome do pilar",
      "titulo": "Título objetivo",
      "gancho3s": "Frase de impacto nos primeiros 3 segundos",
      "roteiroOuSlides": "Roteiro passo a passo (0-3s / 3-30s / 30-45s)",
      "legenda": "Legenda pronta para Instagram/Facebook com CTA para link da bio ou WhatsApp",
      "cta": "Chamada para ação clara",
      "hashtags": ["#BelaFarmaSul", "#IpirangaJF", "#JuizDeFora"],
      "alertaAnvisa": "Lembrete curto de compliance sanitário para este post"
    },
    {
      "id": "post_2",
      "dia": "Quinta-feira",
      "formato": "Carrossel salvável (4-6 cards)",
      "pilar": "...",
      "titulo": "...",
      "gancho3s": "...",
      "roteiroOuSlides": "Card 1 ... Card 2 ... Card 3 ... Card 4 ...",
      "legenda": "...",
      "cta": "...",
      "hashtags": ["#BelaFarmaSul", "#IpirangaJF", "#JuizDeFora"],
      "alertaAnvisa": "..."
    },
    {
      "id": "post_3",
      "dia": "Sexta-feira",
      "formato": "Post / Reels Comercial (mãos/prateleira)",
      "pilar": "...",
      "titulo": "...",
      "gancho3s": "...",
      "roteiroOuSlides": "...",
      "legenda": "...",
      "cta": "...",
      "hashtags": ["#BelaFarmaSul", "#IpirangaJF", "#CartaoBrasilCard"],
      "alertaAnvisa": "..."
    }
  ],
  "stories": [
    { "dia": "Segunda", "ideia": "...", "cta": "..." },
    { "dia": "Terça", "ideia": "...", "cta": "..." },
    { "dia": "Quarta", "ideia": "...", "cta": "..." },
    { "dia": "Quinta", "ideia": "...", "cta": "..." },
    { "dia": "Sexta", "ideia": "...", "cta": "..." }
  ],
  "googlePerfil": {
    "titulo": "Título da atualização semanal no Google Perfil da Empresa",
    "texto": "Texto curto (até 350 caracteres) com palavras-chave locais e CTA",
    "ctaBotao": "Pedir no WhatsApp"
  },
  "sugestaoTrafegoPago": {
    "objetivo": "Divisão 40% Visitas ao Perfil / 60% WhatsApp ou /bio",
    "publico": "Raio 2–5 km do Bairro Ipiranga (Zona Sul JF)",
    "verbaSugerida": "Valor diário compatível com R$ ${budget}/mês",
    "ideiaCriativo": "Qual dos 3 posts impulsionar e com qual chamada segura"
  }
}`;

  try {
    const rawText = await callAI(
      prompt,
      'Você é a Isa-Marketing, especialista em marketing farmacêutico local e compliance ANVISA RDC 96/2008. Retorne estritamente JSON válido.',
      { temperature: 0.7, maxTokens: 3500, responseMimeType: 'application/json' }
    );
    const cleaned = String(rawText || '').replace(/```json/gi, '').replace(/```/g, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : cleaned);
    return normalizarPlanoSocial(parsed, fallbackPlan);
  } catch (err) {
    console.warn('[IsaMarketing] Usando fallback determinístico para pauta social:', err.message);
    return fallbackPlan;
  }
}

/**
 * Formata o plano semanal social em mensagem enxuta e pronta para envio via WhatsApp.
 */
function formatarPlanoSocialWhatsApp(weekPlan = {}, config = {}) {
  const ig = config.instagramHandle || '@belafarmasul';
  const posts = Array.isArray(weekPlan.postsFeed) ? weekPlan.postsFeed : [];
  const gp = weekPlan.googlePerfil || {};

  const linhasPosts = posts.map((p, idx) => (
    `${idx + 1}. *${p.dia || `Post ${idx + 1}`}* (${p.formato || 'Feed'})\n` +
    `   📌 *Tema:* ${p.titulo || '-'}\n` +
    `   🎯 *Gancho (3s):* _"${p.gancho3s || ''}"_`
  )).join('\n\n');

  return [
    `🚀 *PAUTA DA SEMANA — BELA FARMA SUL*`,
    `📱 ${ig} | 📍 Ipiranga, JF`,
    weekPlan.temaSemana ? `✨ *Tema:* ${weekPlan.temaSemana}` : '',
    weekPlan.climateContext ? `🌤️ *Clima JF:* ${weekPlan.climateContext}` : '',
    '',
    `🎬 *3 POSTS DA SEMANA (Ritmo Sustentável):*`,
    linhasPosts || '_Nenhum post listado._',
    '',
    `⏱️ *Lembrete de Produção:* Separe 30 min em um único horário para gravar o Reels da semana em lote (vertical, boa iluminação e legenda).`,
    gp.titulo ? `📍 *Google Perfil:* ${gp.titulo}` : '',
    `🔗 *Link da Bio:* drogariabelafarma.com.br/bio`,
  ].filter(Boolean).join('\n');
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
  gerarCalendarioSemanalSocial,
  formatarPlanoSocialWhatsApp,
  DATAS_COMEMORATIVAS,
  ISA_SYSTEM_PROMPT,
};
