/**
 * whatsapp-shortage.service.js
 * Monitoramento Automático de Faltas via WhatsApp — Drogaria Bela Farma Sul
 * 
 * Este serviço monitora e analisa conversas de WhatsApp via Evolution API,
 * identificando automaticamente produtos solicitados e não encontrados em estoque.
 */

const fetch = require('node-fetch');
const { callAI } = require('./ai.service');
const messageSender = require('./message-sender.service');

const EVOLUTION_MAIN_INSTANCE = process.env.EVOLUTION_MAIN_INSTANCE || 'belaFarma';
const API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const API_KEY = process.env.EVOLUTION_API_KEY || process.env.EVOLUTION_SENDER_API_KEY || 'BelafarmaSul2026';

// Helper: chamar Evolution API
async function evolutionFetch(path, options = {}) {
  const url = `${API_URL}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'apikey': API_KEY,
      ...(options.headers || {}),
    },
  });
}

// Helper: limpar e normalizar telefone
function cleanPhone(phone) {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

// Helper: formatar telefone no formato padrão da BelaFarma: 03288634755
function formatToUserPhone(phone) {
  if (!phone) return '';
  let clean = phone.replace(/\D/g, '');
  
  if (clean.length > 13 || clean.length < 10) return '';
  
  if (clean.startsWith('55') && (clean.length === 12 || clean.length === 13)) {
    clean = clean.slice(2);
  }
  
  if (clean.length === 10 || clean.length === 11) {
    if (!clean.startsWith('0')) {
      clean = '0' + clean;
    }
  } else {
    return '';
  }
  
  return clean;
}

// Helper: identificar nomes genéricos
function isGenericName(name) {
  if (!name) return true;
  const lower = name.toLowerCase().trim();
  return ['contato whatsapp', 'cliente whatsapp', 'whatsapp', 'contato', 'contato whatsapp crm'].includes(lower);
}

// Helper: gerar ID único
function genId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * Executa a varredura automática de faltas de produtos nas conversas do WhatsApp
 */
async function executarVarreduraWhatsApp(db, options = {}) {
  const stats = { totalChats: 0, processedChats: 0, shortagesAdded: 0, newProducts: [] };
  const maxContactsToAnalyze = options.initialScan30Days ? 100 : 50; // limite preventivo para rate limit

  try {
    console.log(`[WhatsAppShortage] 🔍 Iniciando varredura de faltas (Modo: ${options.initialScan30Days ? 'Histórico 30 Dias' : 'Periódico'})...`);

    // 1. Determinar o limite de tempo para a varredura
    const agora = Date.now();
    let timeLimit = 0;

    if (options.initialScan30Days) {
      // Histórico dos últimos 30 dias
      timeLimit = agora - (30 * 24 * 60 * 60 * 1000);
    } else {
      // Periódico (últimas 12 horas ou desde a última verificação)
      const dozeHorasMs = 12 * 60 * 60 * 1000;
      timeLimit = agora - dozeHorasMs;
      try {
        const lastScanSetting = db.prepare("SELECT value FROM system_settings WHERE key = 'whatsapp_shortage_last_scan'").get();
        if (lastScanSetting && lastScanSetting.value) {
          timeLimit = Math.max(new Date(lastScanSetting.value).getTime(), agora - (24 * 60 * 60 * 1000)); // no máximo 24 horas atrás
        }
      } catch (dbErr) { /* fallback para 12h */ }
    }

    // 2. Buscar contatos ativos no SQLite local que tiveram conversas no período
    let activePhones = [];
    try {
      activePhones = db.prepare(`
        SELECT phone, MAX(timestamp) as lastInteractionTime
        FROM whatsapp_messages
        WHERE timestamp > ?
        GROUP BY phone
        ORDER BY lastInteractionTime DESC
        LIMIT ?
      `).all(timeLimit, maxContactsToAnalyze);
    } catch (sqlErr) {
      console.error('[WhatsAppShortage] ❌ Erro ao buscar telefones ativos no SQLite local:', sqlErr.message);
      return { success: false, error: sqlErr.message, stats };
    }

    stats.totalChats = activePhones.length;
    console.log(`[WhatsAppShortage] 🔢 Total de contatos locais a processar: ${stats.totalChats}`);

    // 3. Processar cada conversa com a IA
    for (const contact of activePhones) {
      const rawPhone = contact.phone;
      const phone = formatToUserPhone(rawPhone) || rawPhone;
      if (!phone) continue;

      // Buscar nome do cliente na tabela customers local
      let customerName = 'Contato WhatsApp';
      try {
        const cust = db.prepare('SELECT name FROM customers WHERE phone = ?').get(rawPhone);
        if (cust && cust.name) {
          customerName = cust.name;
        }
      } catch (custErr) { /* ignora */ }

      // Carregar as últimas 25 mensagens do SQLite local
      let dialog = '';
      try {
        const localMsgs = db.prepare(`
          SELECT fromMe, messageText
          FROM whatsapp_messages
          WHERE phone = ?
          ORDER BY timestamp DESC
          LIMIT 25
        `).all(rawPhone);

        if (localMsgs && localMsgs.length > 0) {
          const sorted = [...localMsgs].reverse();
          dialog = sorted.map(m => {
            const sender = m.fromMe === 1 ? 'Atendente/Bela' : 'Cliente';
            return m.messageText ? `${sender}: ${m.messageText}` : null;
          }).filter(Boolean).join('\n');
        }
      } catch (msgErr) {
        console.warn(`[WhatsAppShortage] ⚠️ Falha ao buscar histórico do contato local ${customerName} (${rawPhone}):`, msgErr.message);
        continue;
      }

      // Se a conversa for irrelevante ou curta demais, pula
      if (!dialog || dialog.length < 20) continue;

      stats.processedChats++;

      // Chamar IA para extrair faltas de produtos
      try {
        const systemPrompt = `Você é o auditor de IA do CRM da Drogaria Bela Farma Sul.
Analise a conversa de WhatsApp e responda estritamente com um array JSON válido (sem blocos de código markdown como \`\`\`json) no seguinte formato:
[
  {
    "nome": "Nome do Produto",
    "status": "nao_encontrado" | "outro",
    "tipo": "Genérico" | "Similar" | "Perfumaria" | "Marca (Referência)"
  }
]
Regras de status:
- "nao_encontrado": Use se o cliente solicitou ou perguntou pelo produto e o atendente informou/confirmou que a farmácia não o tem em estoque hoje ou que está em falta.
- "outro": Use para qualquer outro caso (se tinha o produto, se era apenas dúvida de receita, se comprou, etc).
Retorne apenas produtos com status "nao_encontrado". Se não houver produtos em falta, retorne um array vazio: []`;

        const aiResponse = await callAI(
          `Analise a conversa:\n---\n${dialog}\n---`,
          systemPrompt,
          { temperature: 0.1 }
        );

        let cleaned = aiResponse.trim().replace(/^```json?\s*/i, '').replace(/```$/, '').trim();
        const parsed = JSON.parse(cleaned);

        if (Array.isArray(parsed) && parsed.length > 0) {
          for (const prod of parsed) {
            if (!prod.nome || prod.nome.length < 2 || prod.status !== 'nao_encontrado') continue;

            const nomeProduto = prod.nome.toUpperCase().trim();
            const tipoProduto = prod.tipo || 'Marca (Referência)';

            // Verificar se o produto já existe na tabela de faltas e se ainda não foi resolvido
            const shortageExists = db.prepare(`
              SELECT id FROM shortages 
              WHERE productName = ? AND source = 'WhatsApp' AND purchased = 0 AND ordered = 0
            `).get(nomeProduto);

            if (!shortageExists) {
              const shortageId = genId('sh_wa');
              const dataAtual = new Date().toISOString();
              const notes = `Solicitado por ${customerName} (${phone}) - Identificado automaticamente via IA em ${new Date().toLocaleDateString('pt-BR')}`;

              db.prepare(`
                INSERT INTO shortages (id, productName, type, clientInquiry, notes, createdAt, userName, source, purchased, ordered)
                VALUES (?, ?, ?, 1, ?, ?, 'WhatsApp Bot', 'WhatsApp', 0, 0)
              `).run(shortageId, nomeProduto, tipoProduto, notes, dataAtual);

              stats.shortagesAdded++;
              stats.newProducts.push({ nome: nomeProduto, cliente: customerName });
              console.log(`[WhatsAppShortage] 🔴 Falta cadastrada automaticamente: ${nomeProduto} (solicitado por ${customerName})`);
            }
          }
        }
      } catch (aiErr) {
        console.warn(`[WhatsAppShortage] ⚠️ Falha na análise da IA para ${customerName} (${phone}):`, aiErr.message);
      }
    }

    // 4. Salvar data/hora da última execução
    const dataHoraExecucao = new Date().toISOString();
    db.prepare("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)")
      .run('whatsapp_shortage_last_scan', dataHoraExecucao, dataHoraExecucao);

    if (options.initialScan30Days) {
      db.prepare("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)")
        .run('whatsapp_shortage_initial_scan_done', '1', dataHoraExecucao);
      console.log(`[WhatsAppShortage] ✅ Varredura histórica concluída! ${stats.shortagesAdded} novas faltas encontradas.`);
    } else {
      console.log(`[WhatsAppShortage] ✅ Varredura periódica concluída! ${stats.shortagesAdded} novas faltas encontradas.`);
    }

    // 5. Enviar notificação no WhatsApp do administrador (Edevaldo) se houver novas faltas
    if (stats.shortagesAdded > 0 && process.env.EDEVALDO_WHATSAPP) {
      const targetPhone = process.env.EDEVALDO_WHATSAPP;
      
      let msg = `🤖 *BelaFarma Bot: Detecção de Faltas no WhatsApp*\n\n`;
      msg += `Identifiquei de forma automatizada *${stats.shortagesAdded}* novo(s) produto(s) em falta em conversas recentes:\n\n`;
      
      stats.newProducts.forEach((p, idx) => {
        msg += `🛒 *${idx + 1}. ${p.nome}*\n   └ Solicitado por: _${p.cliente}_\n`;
      });
      
      msg += `\nTodos já foram incluídos na sua *Lista de Faltas* no painel do sistema como urgentes (Procura de Cliente) 🔔`;

      console.log(`[WhatsAppShortage] 📱 Enviando notificação de faltas para Edevaldo (${targetPhone})...`);
      await messageSender.sendMessage(targetPhone, msg);
    }

    return { success: true, stats };

  } catch (err) {
    console.error('[WhatsAppShortage] ❌ Erro fatal na execução da varredura:', err);
    return { success: false, error: err.message, stats };
  }
}

module.exports = {
  executarVarreduraWhatsApp
};
