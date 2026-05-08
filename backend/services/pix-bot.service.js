const { callAI } = require('./ai.service');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

/**
 * Serviço para Monitoramento Automático de Comprovantes de PIX
 */
class PixBotService {
  constructor(db) {
    this.db = db;
    this.evolutionApiUrl = process.env.EVOLUTION_API_URL || 'http://evolution-api:8080';
    this.evolutionApiKey = process.env.EVOLUTION_API_KEY || 'BelafarmaSul2026';
    this.instanceName = process.env.EVOLUTION_INSTANCE_NAME || 'belafarma';
  }

  /**
   * Processa uma mensagem recebida do webhook
   */
  async processMessage(payload) {
    const event = payload.event;
    const data = payload.data;

    if (event !== 'messages.upsert' || !data || data.key.fromMe) return;

    const message = data.message;
    const remoteJid = data.key.remoteJid;
    const phone = remoteJid.split('@')[0];

    // Verifica se é uma imagem
    const isImage = !!(message?.imageMessage || message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage);
    
    if (isImage) {
      console.log(`[PixBot] 📸 Foto recebida de ${phone}. Analisando se é um PIX...`);
      return this.handleImageMessage(data, phone);
    }
  }

  /**
   * Baixa a imagem e envia para análise da IA
   */
  async handleImageMessage(messageData, phone) {
    try {
      const messageId = messageData.key.id;
      
      // 1. Obter o Base64 da imagem via Evolution API
      const base64 = await this.getBase64FromEvolution(messageId);
      if (!base64) {
        console.error('[PixBot] ❌ Não foi possível obter o base64 da imagem.');
        return;
      }

      // 2. Chamar a IA para analisar o comprovante
      const prompt = `
        Analise esta imagem e verifique se é um comprovante de transferência PIX.
        Critérios obrigatórios:
        1. O destino deve ser "Bela Farma" ou "Bela Farma Ltda" ou algo muito similar que indique a farmácia.
        2. Deve ser um comprovante de ENVIO/TRANSFERÊNCIA concluída, não apenas um agendamento.

        Responda EXATAMENTE no formato JSON abaixo:
        {
          "isPix": boolean,
          "isBelaFarma": boolean,
          "value": number,
          "senderName": string,
          "date": string (ISO ou formato legível),
          "confidence": number (0 a 1),
          "reason": "breve explicação do motivo de ser ou não um PIX válido"
        }
      `;

      const aiResponse = await callAI(prompt, "Você é um assistente financeiro especializado em validar comprovantes bancários para a farmácia Bela Farma.", {
        imageData: base64,
        temperature: 0.1 // Baixa temperatura para ser mais preciso
      });

      // Limpar resposta da IA (remover markdown de JSON se houver)
      const cleanJson = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      const result = JSON.parse(cleanJson);

      console.log(`[PixBot] 🤖 Resultado da IA para ${phone}:`, result);

      if (result.isPix && result.isBelaFarma && result.confidence > 0.8) {
        await this.confirmPix(result, phone, messageId);
      } else if (result.isPix && !result.isBelaFarma) {
        console.log(`[PixBot] ⚠️ PIX detectado, mas destino NÃO é Bela Farma: ${result.reason}`);
      }

    } catch (err) {
      console.error('[PixBot] 💥 Erro ao processar imagem:', err.message);
    }
  }

  /**
   * Obtém a mídia em base64 da Evolution API
   */
  async getBase64FromEvolution(messageId) {
    try {
      const url = `${this.evolutionApiUrl}/message/getBase64FromMediaMessage/${this.instanceName}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.evolutionApiKey
        },
        body: JSON.stringify({
          messageKey: {
            id: messageId
          },
          convertToMp4: false
        })
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Evolution API Error: ${err}`);
      }

      const data = await response.json();
      return data.base64 || data.data?.base64;
    } catch (err) {
      console.error('[PixBot] Erro ao baixar mídia:', err.message);
      return null;
    }
  }

  /**
   * Registra a confirmação do PIX e cria uma notificação/tarefa
   */
  async confirmPix(pixData, phone, messageId) {
    const now = new Date().toISOString();
    const id = `pix_${Date.now()}`;

    try {
      // 1. Salvar no banco
      this.db.prepare(`
        INSERT INTO pix_confirmations (id, phone, value, senderName, pixDate, status, aiAnalysis, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, 
        phone, 
        pixData.value, 
        pixData.senderName, 
        pixData.date, 
        'Confirmado', 
        pixData.reason, 
        now
      );

      console.log(`[PixBot] ✅ PIX de R$ ${pixData.value} (${pixData.senderName}) confirmado com sucesso!`);

      // 2. Criar uma tarefa no sistema para os vendedores verem
      const taskId = `task_pix_${Date.now()}`;
      this.db.prepare(`
        INSERT INTO tasks (
          id, title, description, assignedUser, creator, priority, status, dueDate, creationDate, color
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        taskId,
        `💰 PIX Recebido: R$ ${pixData.value}`,
        `Comprovante enviado por ${phone}.\nPagador: ${pixData.senderName}\nData: ${pixData.date}\nRef: ${messageId}`,
        'all_users',
        'Robô de PIX',
        'Alta',
        'Concluído', // Já marca como concluído pois é apenas informativo
        now,
        now,
        '#22c55e' // Verde PIX
      );

      // 3. (Opcional) Enviar confirmação via WhatsApp para o cliente
      // require('./message-sender.service').sendMessage(phone, `✅ *Comprovante Recebido!* \n\nOlá! Identificamos seu PIX de *R$ ${pixData.value}*. Obrigado pela preferência! 💊🚀`);

    } catch (err) {
      console.error('[PixBot] Erro ao salvar confirmação:', err.message);
    }
  }
}

module.exports = PixBotService;
