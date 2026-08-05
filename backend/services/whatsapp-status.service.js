const db = require('../database-factory');
const { callAI } = require('./ai.service');
const { buscarClimaReal } = require('./marketing-agent.service');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch'); // Requer node-fetch, que já deve estar instalado

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function postarStatusDiario() {
  try {
    console.log('[WhatsAppStatus] Iniciando a rotina diária de postagem de Status (08:00)...');

    const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
    const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || 'BelafarmaSul2026';
    const EVOLUTION_INSTANCE = process.env.EVOLUTION_MAIN_INSTANCE || 'belaFarma'; // Pode ser belaFarma

    // 1. Validar se há ofertas no banco
    const availableOffers = db.prepare('SELECT * FROM whatsapp_offers_bank').all();
    if (availableOffers.length === 0) {
      console.log('[WhatsAppStatus] ⚠️ Nenhuma oferta cadastrada no banco. Abortando postagem de Status.');
      return;
    }

    // 2. Obter contexto (clima, dia)
    const diaAtual = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long' });
    let clima = 'Desconhecido';
    try {
      clima = await buscarClimaReal();
    } catch (err) {
      console.log('[WhatsAppStatus] Falha ao buscar clima, usando fallback.');
    }

    console.log(`[WhatsAppStatus] Contexto: ${diaAtual}, Clima: ${clima}. Selecionando até 15 ofertas via IA...`);

    // 3. Chamar IA para selecionar 15 ofertas
    const prompt = `Você é a IA estratégica da Bela Farma (Drogaria Bela Farma).
Seu papel é escolher AS 15 MELHORES OFERTAS para postar AGORA no Status do WhatsApp.
O Status é uma vitrine rápida, então as legendas devem ser super curtas, focadas no produto e preço.

Contexto Atual:
- Dia da semana: ${diaAtual}
- Clima em Juiz de Fora: ${clima}

Banco de Ofertas Disponíveis (ID | Produto | Preço | Legenda Original):
${availableOffers.map(o => `${o.id} | ${o.productName} | R$${o.price.toFixed(2)} | ${o.aiCaption.replace(/\n/g, ' ')}`).join('\n')}

TAREFA:
1. Selecione EXATAMENTE 15 ofertas diferentes (ou o máximo que tiver, se houver menos de 15 no banco).
2. Tente fazer sentido com o clima (frio = antigripais; sol = protetor) e dia.
3. Para CADA oferta selecionada, crie uma legenda BEM CURTA (no máximo 50 caracteres) adequada para sobrepor numa imagem de Status. NÃO use frases longas.
4. Ordene as ofertas em uma sequência lógica e atrativa (ex: Beleza e Cuidados Pessoais -> Saúde -> Infantil).

Responda EXATAMENTE com um array JSON no formato abaixo (sem markdown \`\`\` em volta):
[
  {
    "selectedOfferId": "ID_ESCOLHIDO",
    "shortCaption": "Legenda ultra curta e atrativa!"
  },
  ... (até 15 objetos)
]`;

    let selectedList = [];
    try {
      const aiResponseStr = await callAI(prompt, 'Você é um assistente JSON. Retorne apenas um array JSON válido.', { temperature: 0.7 });
      const aiResponseRaw = aiResponseStr.replace(/```json/g, '').replace(/```/g, '').trim();
      selectedList = JSON.parse(aiResponseRaw);
      
      if (!Array.isArray(selectedList)) {
        throw new Error("A resposta da IA não foi um array.");
      }
    } catch (e) {
      console.error('[WhatsAppStatus] ❌ Erro ao chamar/analisar IA para o Status:', e.message);
      // Fallback: Pega as 15 primeiras ofertas
      selectedList = availableOffers.slice(0, 15).map(o => ({
        selectedOfferId: o.id,
        shortCaption: `Oferta: ${o.productName} por apenas R$${o.price.toFixed(2)}!`
      }));
    }

    console.log(`[WhatsAppStatus] IA selecionou ${selectedList.length} ofertas para o Status.`);

    // 4. Loop de Envio via Baileys
    let sucessoCount = 0;
    const baileys = require('./baileys-service');
    const status = baileys.getStatus();
    
    if (!status.connected) {
       console.error('[WhatsAppStatus] ❌ Baileys não está conectado. Abortando.');
       return;
    }
    
    for (let i = 0; i < selectedList.length; i++) {
      const item = selectedList[i];
      const offer = availableOffers.find(o => o.id === item.selectedOfferId);
      
      if (!offer) {
        console.warn(`[WhatsAppStatus] ⚠️ Oferta ${item.selectedOfferId} não encontrada. Pulando...`);
        continue;
      }

      console.log(`[WhatsAppStatus Baileys] Postando ${i + 1}/${selectedList.length}: ${offer.productName}`);

      let caption = item.shortCaption;

      if (!offer.mediaPath) {
        console.warn(`[WhatsAppStatus Baileys] ⚠️ Oferta sem imagem. Pulando...`);
        continue;
      }

      try {
        await baileys.sendStatus(offer.mediaPath, caption);
        sucessoCount++;
        console.log(`[WhatsAppStatus Baileys] ✅ Status ${i + 1} postado com sucesso!`);
      } catch (reqErr) {
        console.error(`[WhatsAppStatus Baileys] ❌ Falha ao postar status:`, reqErr.message);
      }

      // Adiciona um delay de 5 a 8 segundos entre os envios para ser humanizado e não sobrecarregar
      const randomDelay = Math.floor(Math.random() * 3000) + 5000;
      await delay(randomDelay);
    }

    console.log(`[WhatsAppStatus] 🎉 Rotina de Status finalizada! Postados: ${sucessoCount}/${selectedList.length}.`);
  } catch (globalErr) {
    console.error('[WhatsAppStatus] 💥 Erro crítico na rotina de status:', globalErr);
  }
}

module.exports = { postarStatusDiario };
