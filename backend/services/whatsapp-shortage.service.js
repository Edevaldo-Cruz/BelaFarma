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

    // 1. Buscar todos os chats ativos
    let chats = [];
    try {
      const chatsRes = await evolutionFetch(`/chat/findChats/${EVOLUTION_MAIN_INSTANCE}`);
      if (chatsRes.ok) {
        const data = await chatsRes.json();
        chats = Array.isArray(data) ? data : (data.chats || data.data || []);
      } else {
        console.warn(`[WhatsAppShortage] ⚠️ Falha ao buscar chats da API Evolution (Status: ${chatsRes.status})`);
        return { success: false, error: `API status ${chatsRes.status}`, stats };
      }
    } catch (chatErr) {
      console.error('[WhatsAppShortage] ❌ Erro ao buscar chats na Evolution:', chatErr.message);
      return { success: false, error: chatErr.message, stats };
    }

    // 2. Filtrar e ordenar chats relevantes
    // Apenas contatos individuais (sem grupos) e ativos recentemente
    const agora = Date.now();
    const trintaDiasMs = 30 * 24 * 60 * 60 * 1000;
    const dozeHorasMs = 12 * 60 * 60 * 1000;

    let filteredChats = chats
      .filter(c => {
        const jid = c.id || c.remoteJid || '';
        return jid && !jid.includes('@g.us') && !jid.includes('@broadcast');
      })
      .map(c => {
        let lastInteractionTime = 0;
        if (c.updatedAt) {
          lastInteractionTime = new Date(c.updatedAt).getTime();
        } else if (c.messageTimestamp) {
          lastInteractionTime = new Date(c.messageTimestamp * 1000).getTime();
        }
        return { ...c, lastInteractionTime };
      });

    if (options.initialScan30Days) {
      // Histórico dos últimos 30 dias
      filteredChats = filteredChats
        .filter(c => c.lastInteractionTime > agora - trintaDiasMs)
        .sort((a, b) => b.lastInteractionTime - a.lastInteractionTime)
        .slice(0, maxContactsToAnalyze);
    } else {
      // Periódico (últimas 12 horas ou desde a última verificação)
      let timeLimit = agora - dozeHorasMs;
      try {
        const lastScanSetting = db.prepare("SELECT value FROM system_settings WHERE key = 'whatsapp_shortage_last_scan'").get();
        if (lastScanSetting && lastScanSetting.value) {
          timeLimit = Math.max(new Date(lastScanSetting.value).getTime(), agora - (24 * 60 * 60 * 1000)); // no máximo 24 horas atrás
        }
      } catch (dbErr) { /* fallback para 12h */ }

      filteredChats = filteredChats
        .filter(c => c.lastInteractionTime > timeLimit)
        .sort((a, b) => b.lastInteractionTime - a.lastInteractionTime)
        .slice(0, maxContactsToAnalyze);
    }

    stats.totalChats = filteredChats.length;
    console.log(`[WhatsAppShortage] 🔢 Total de chats a processar: ${stats.totalChats}`);

    // 3. Processar cada conversa com a IA
    for (const chat of filteredChats) {
      const jid = chat.id || chat.remoteJid || '';
      const rawPhone = jid.split('@')[0];
      const phone = formatToUserPhone(rawPhone);
      if (!phone) continue;

      const customerName = chat.name || chat.pushName || 'Contato WhatsApp';

      // Carregar as últimas 25 mensagens
      let dialog = '';
      try {
        const msgsRes = await evolutionFetch(`/chat/findMessages/${EVOLUTION_MAIN_INSTANCE}`, {
          method: 'POST',
          body: JSON.stringify({
            where: { key: { remoteJid: jid } },
            limit: 25,
          }),
        });

        if (msgsRes.ok) {
          const msgsData = await msgsRes.json();
          const messagesList = Array.isArray(msgsData) ? msgsData : (msgsData.records || []);
          const sorted = [...messagesList].reverse();

          dialog = sorted.map(m => {
            const sender = m.key?.fromMe ? 'Atendente/Bela' : 'Cliente';
            const msg = m.message;
            let text = '';
            if (msg) {
              text = msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || '';
              if (!text && msg.imageMessage) text = '[Imagem]';
              if (!text && msg.audioMessage) text = '[Áudio]';
            }
            return text ? `${sender}: ${text}` : null;
          }).filter(Boolean).join('\n');
        }
      } catch (e) {
        console.warn(`[WhatsAppShortage] ⚠️ Falha ao buscar histórico do contato ${customerName} (${phone})`, e.message);
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
