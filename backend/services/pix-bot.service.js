const { callAI } = require('./ai.service');
const { notifyAdmin } = require('./whatsapp.service');
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
    this.instanceName = process.env.EVOLUTION_INSTANCE_NAME || 'BelaFarma2';
  }

  /**
   * Processa uma mensagem recebida do webhook
   */
  async processMessage(payload) {
    const event = payload.event;
    const data = payload.data;

    console.log(`[PixBot] 📥 Webhook recebido - Evento: "${event}", fromMe: ${data?.key?.fromMe}, temImagem: ${!!(data?.message?.imageMessage)}`);
    console.log(`[PixBot] 🔍 Chaves do payload:`, Object.keys(payload));
    console.log(`[PixBot] 🔍 Chaves do data:`, data ? Object.keys(data) : 'null');
    console.log(`[PixBot] 🔍 Chaves do message:`, data?.message ? Object.keys(data.message) : 'null');
    console.log(`[PixBot] 🔍 messageType:`, data?.messageType || 'N/A');

    if (!event || event.toLowerCase() !== 'messages.upsert' || !data || data.key.fromMe) return;

    const message = data.message;
    const remoteJid = data.key.remoteJid || '';

    // Ignorar explicitamente se for mensagem de grupo ou transmissão (evita desperdício de tokens)
    if (remoteJid.endsWith('@g.us') || remoteJid.endsWith('@broadcast') || remoteJid.includes('@g.us') || remoteJid.includes('@broadcast')) {
      console.log(`[PixBot] ℹ️ Ignorando mensagem recebida de grupo ou transmissão: ${remoteJid}`);
      return;
    }

    const phone = remoteJid.split('@')[0];
    const messageType = data.messageType || '';

    // Verifica se é uma imagem (vários formatos possíveis do WhatsApp / Evolution API)
    const isImage = !!(
      message?.imageMessage || 
      messageType === 'imageMessage' ||
      messageType === 'documentWithCaptionMessage' ||
      messageType === 'documentMessage' ||
      message?.documentWithCaptionMessage ||
      message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage ||
      // Formato alternativo da Evolution API v2
      (data.messageType && data.messageType.toLowerCase().includes('image')) ||
      // Verifica se o objeto message tem uma chave que termine em 'Message' e contenha mimeType de imagem
      Object.keys(message || {}).some(key => key.endsWith('Message') && message[key]?.mimetype?.startsWith('image/'))
    );
    
    console.log(`[PixBot] 🔍 isImage=${isImage}, messageType='${messageType}', messageKeys=[${Object.keys(message || {}).join(', ')}]`);
    
    if (isImage) {
      console.log(`[PixBot] 📸 Foto recebida de ${phone} via ${payload.instance} (tipo: ${messageType}). Analisando se é um PIX...`);
      return this.handleImageMessage(data, phone, payload.instance);
    }
  }

  /**
   * Baixa a imagem e envia para análise da IA
   */
  async handleImageMessage(messageData, phone, instanceName) {
    try {
      const messageKey = messageData.key;
      
      // 1. Obter o Base64 e o formato da mídia via Evolution API usando a instância dinâmica
      const media = await this.getBase64FromEvolution(messageKey, messageData.message, instanceName);
      if (!media || !media.base64) {
        console.error('[PixBot] ❌ Não foi possível obter o base64 da imagem.');
        return;
      }

      const todayDateStr = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).format(new Date());
      const prompt = `
        Você é um Auditor Financeiro Antifraude rigoroso da farmácia "Bela Farma Sul Ltda".
        Analise esta imagem e verifique se é um comprovante PIX 100% VÁLIDO E SEGURO.
        
        DADOS OFICIAIS DA FARMÁCIA (destinatário esperado):
        - Nome: "BELA FARMA SUL LTDA" ou "Bela Farma Sul Ltda" ou "Bela Farma"
        - CPF/CNPJ: pode aparecer parcialmente mascarado (ex: ***.785.780-**140 ou 47.378.578/****-**)
        - Chave PIX: pode ser email (belafarmasul@gmail.com), CPF ou CNPJ mascarado
        - Instituição: Mercado Pago ou qualquer banco
        - DICA VISUAL: O Mercado Pago costuma exibir valores redondos SEM CENTAVOS (ex: "R$ 19") e usa uma fonte limpa e espaçada. Isso NÃO é sinal de falsificação.

        CRITÉRIOS DE SEGURANÇA OBRIGATÓRIOS (Recuse se algum falhar):
        1. DESTINATÁRIO (campo "Para" no comprovante): O nome deve corresponder à farmácia conforme dados acima. CPF/CNPJ e chave PIX podem estar parcialmente ocultos — isso é NORMAL nos comprovantes brasileiros. RECUSE apenas se o nome do destinatário for claramente outra pessoa ou empresa.
        2. REMETENTE (campo "De" no comprovante): Pode ser qualquer pessoa física (CPF) ou jurídica (CNPJ), com documento parcial ou totalmente mascarado. NUNCA recuse por causa do remetente.
        3. STATUS CONCLUÍDO: A transferência DEVE ser efetivada (Sucesso, Realizada, Concluída). RECUSE IMEDIATAMENTE se houver as palavras "Agendamento", "Aguardando", "Em processamento" ou "Agendado para".
        4. DATA E HORA: A data da transação NÃO PODE SER ANTIGA. Hoje é: ${todayDateStr}. Valide se o comprovante é de HOJE.
        5. INTEGRIDADE VISUAL: Busque por indícios de falsificação grosseira (fontes misturadas, linhas tortas). O design minimalista do Mercado Pago (com logos azuis e layout limpo) é legítimo e deve ser aceito.

        Responda EXATAMENTE no formato JSON abaixo (sem \`\`\`json ou texto extra):
        {
          "isPix": boolean,
          "isBelaFarma": boolean,
          "isValidStatus": boolean,
          "isTodayDate": boolean,
          "value": 15.50, // use APENAS números e ponto para decimais, sem R$ e sem aspas
          "senderName": string,
          "date": string (data extraída da imagem),
          "confidence": number (0 a 1),
          "reason": "Se aprovado, escreva APENAS 'OK'. Se recusado, explique o motivo."
        }
      `;

      const aiResponse = await callAI(prompt, "Você é um auditor financeiro rigoroso antifraude da Bela Farma.", {
        imageData: media.base64,
        mimeType: media.mimeType,
        temperature: 0.0 // 0.0 para ser estritamente analítico e sem alucinações
      });

      // Limpar resposta da IA (extrair apenas o bloco JSON caso haja texto extra do Gemini)
      let cleanJson = aiResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanJson = jsonMatch[0];
      }
      
      let result;
      try {
        result = JSON.parse(cleanJson);
      } catch (parseError) {
        console.error(`[PixBot] ❌ Erro no JSON.parse. Resposta bruta da IA: ${aiResponse}`);
        return;
      }

      // Sanitizar o valor (remover R$, corrigir vírgulas)
      if (typeof result.value === 'string') {
         result.value = parseFloat(result.value.replace(/[^\d.,]/g, '').replace(',', '.'));
      }
      if (isNaN(result.value) || !result.value) result.value = 0;

      console.log(`[PixBot] 🤖 Auditoria IA para ${phone}:`, result);

      if (!result.isPix) {
        console.log(`[PixBot] ℹ️ A imagem recebida de ${phone} não é um comprovante PIX (ex: receita médica). Ignorando silenciosamente.`);
        return;
      }

      const aprovado = result.isBelaFarma && 
                       result.isValidStatus && 
                       result.isTodayDate && 
                       result.confidence > 0.85;

      if (aprovado) {
        await this.confirmPix(result, phone, messageKey.id);
      } else {
        console.log(`[PixBot] 🚫 PIX RECUSADO PELA SEGURANÇA: ${result.reason}`);
        
        // Registrar a recusa como uma tarefa para que os caixas fiquem cientes da tentativa suspeita
        await this.logRejectedPix(result, phone);
      }

    } catch (err) {
      console.error('[PixBot] 💥 Erro ao processar imagem:', err.message);
    }
  }

  /**
   * (NOVO) Processa uma imagem vinda diretamente do Baileys nativo.
   * Não precisa de webhook ou da Evolution API.
   */
  async processBaileysImage(base64Image, mimeType, phone, messageId) {
    try {
      console.log(`[PixBot] 📸 Imagem interceptada do Baileys para o número ${phone}. Iniciando auditoria...`);
      
      const todayDateStr = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit', month: '2-digit', year: 'numeric'
      }).format(new Date());

      const prompt = `
        Você é um Auditor Financeiro Antifraude rigoroso da farmácia "Bela Farma Sul Ltda".
        Analise esta imagem e verifique se é um comprovante PIX 100% VÁLIDO E SEGURO.
        
        DADOS OFICIAIS DA FARMÁCIA (destinatário esperado):
        - Nome: "BELA FARMA SUL LTDA" ou "Bela Farma Sul Ltda" ou "Bela Farma"
        - CPF/CNPJ: pode aparecer parcialmente mascarado (ex: ***.785.780-**140 ou 47.378.578/****-**)
        - Chave PIX: pode ser email (belafarmasul@gmail.com), CPF ou CNPJ mascarado
        - Instituição: Mercado Pago ou qualquer banco
        - DICA VISUAL: O Mercado Pago costuma exibir valores redondos SEM CENTAVOS (ex: "R$ 19") e usa uma fonte limpa e espaçada. Isso NÃO é sinal de falsificação.

        CRITÉRIOS DE SEGURANÇA OBRIGATÓRIOS (Recuse se algum falhar):
        1. DESTINATÁRIO (campo "Para" no comprovante): O nome deve corresponder à farmácia conforme dados acima. CPF/CNPJ e chave PIX podem estar parcialmente ocultos — isso é NORMAL nos comprovantes brasileiros. RECUSE apenas se o nome do destinatário for claramente outra pessoa ou empresa.
        2. REMETENTE (campo "De" no comprovante): Pode ser qualquer pessoa física (CPF) ou jurídica (CNPJ), com documento parcial ou totalmente mascarado. NUNCA recuse por causa do remetente.
        3. STATUS CONCLUÍDO: A transferência DEVE ser efetivada (Sucesso, Realizada, Concluída). RECUSE IMEDIATAMENTE se houver as palavras "Agendamento", "Aguardando", "Em processamento" ou "Agendado para".
        4. DATA E HORA: A data da transação NÃO PODE SER ANTIGA. Hoje é: ${todayDateStr}. Valide se o comprovante é de HOJE.
        5. INTEGRIDADE VISUAL: Busque por indícios de falsificação grosseira (fontes misturadas, linhas tortas). O design minimalista do Mercado Pago (com logos azuis e layout limpo) é legítimo e deve ser aceito.

        Responda EXATAMENTE no formato JSON abaixo (sem \`\`\`json ou texto extra):
        {
          "isPix": boolean,
          "isBelaFarma": boolean,
          "isValidStatus": boolean,
          "isTodayDate": boolean,
          "value": 15.50, // use APENAS números e ponto para decimais, sem R$ e sem aspas
          "senderName": string,
          "date": string (data extraída da imagem),
          "confidence": number (0 a 1),
          "reason": "Se aprovado, escreva APENAS 'OK'. Se recusado, explique o motivo."
        }
      `;

      const aiResponse = await callAI(prompt, "Você é um auditor financeiro rigoroso antifraude da Bela Farma.", {
        imageData: base64Image,
        mimeType: mimeType || 'image/jpeg',
        temperature: 0.0
      });

      let cleanJson = aiResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanJson = jsonMatch[0];
      }
      
      let result;
      try {
        result = JSON.parse(cleanJson);
      } catch (parseError) {
        console.error(`[PixBot-Baileys] ❌ Erro no JSON.parse. Resposta bruta da IA: ${aiResponse}`);
        return false;
      }

      if (typeof result.value === 'string') {
         result.value = parseFloat(result.value.replace(/[^\d.,]/g, '').replace(',', '.'));
      }
      if (isNaN(result.value) || !result.value) result.value = 0;

      console.log(`[PixBot-Baileys] 🤖 Auditoria IA para ${phone}:`, result);

      if (!result.isPix) {
        console.log(`[PixBot-Baileys] ℹ️ Imagem de ${phone} não é um comprovante PIX. Retornando false para fallback.`);
        return false;
      }

      const aprovado = result.isBelaFarma && result.isValidStatus && result.isTodayDate && result.confidence > 0.85;

      if (aprovado) {
        await this.confirmPix(result, phone, messageId);
      } else {
        console.log(`[PixBot-Baileys] 🚫 PIX RECUSADO PELA SEGURANÇA: ${result.reason}`);
        await this.logRejectedPix(result, phone);
      }
      return true;
    } catch (err) {
      console.error('[PixBot-Baileys] 💥 Erro ao processar imagem:', err.message);
    }
  }

  /**
   * Cria uma tarefa de alerta quando um PIX for recusado por fraude ou inconsistência

   */
  async logRejectedPix(result, phone) {
    const now = new Date().toISOString();
    const id = `fraud_${Date.now()}`;
    
    try {
      this.db.prepare(`
        INSERT INTO tasks (
          id, title, description, assignedUser, creator, priority, status, dueDate, creationDate, color
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        `⚠️ ALERTA DE FRAUDE: PIX Recusado`,
        `Motivo: ${result.reason}\nRemetente: ${result.senderName || 'Desconhecido'}\nValor: R$ ${result.value || 0}\nData na imagem: ${result.date || 'Desconhecida'}\nWhatsApp: ${phone}`,
        'all_users',
        'Segurança PixBot',
        'Alta',
        'A Fazer',
        now,
        now,
        '#ef4444' // Vermelho para indicar alerta de fraude
      );
      console.log(`[PixBot] 🚨 Alerta de fraude registrado nas tarefas.`);

      // Notifica os administradores via WhatsApp
      const alertMessage = `🚨 *ALERTA DE FRAUDE NO PIX* 🚨\n\n` +
                           `Uma tentativa de pagamento suspeita foi bloqueada pelo robô:\n\n` +
                           `📱 *WhatsApp Origem:* ${phone}\n` +
                           `👤 *Remetente do Pix:* ${result.senderName || 'Desconhecido'}\n` +
                           `💰 *Valor Tentado:* R$ ${Number(result.value || 0).toFixed(2)}\n\n` +
                           `🛑 *MOTIVO DO BLOQUEIO:*\n${result.reason}\n\n` +
                           `_Verifique o painel de tarefas do sistema._`;
      
      notifyAdmin(alertMessage).catch(err => console.error('[PixBot] Falha ao notificar admins:', err));

    } catch (err) {
      console.error('[PixBot] Erro ao registrar alerta de fraude:', err.message);
    }
  }

  /**
   * Obtém a mídia em base64 da Evolution API
   */
  async getBase64FromEvolution(messageKey, message, instanceName) {
    try {
      const targetInstance = instanceName || this.instanceName;
      const url = `${this.evolutionApiUrl}/chat/getBase64FromMediaMessage/${targetInstance}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.evolutionApiKey
        },
        body: JSON.stringify({
          message: {
            key: messageKey,
            message: message
          },
          convertToMp4: false
        })
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Evolution API Error: ${err}`);
      }

      const data = await response.json();
      return {
        base64: data.base64 || data.data?.base64,
        mimeType: data.mimetype || data.data?.mimetype || 'image/jpeg'
      };
    } catch (err) {
      console.error('[PixBot] Erro ao baixar mídia:', err.message);
      return null;
    }
  }

  /**
   * Registra a confirmação do PIX e faz o lançamento financeiro
   * Comportamento intencional: sem mensagens, sem tarefas, sem notificações para PIX válido.
   * Admins são notificados APENAS em casos de fraude (ver logRejectedPix).
   */
  async confirmPix(pixData, phone, messageId) {
    const now = new Date().toISOString();
    const today = new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    const id = `pix_${Date.now()}`;

    try {
      // 1. Salvar no histórico de confirmações PIX
      this.db.prepare(`
        INSERT INTO pix_confirmations (id, phone, value, senderName, pixDate, status, aiAnalysis, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, phone, pixData.value, pixData.senderName, pixData.date, 'Confirmado', pixData.reason, now);

      console.log(`[PixBot] ✅ PIX de R$ ${pixData.value} (${pixData.senderName}) confirmado. Realizando lançamento financeiro...`);

      // 2. Lançamento no Pix Direto (registro diário / fechamento)
      this.recordPixDirect(pixData.value, pixData.senderName, today);

    } catch (err) {
      console.error('[PixBot] Erro ao salvar confirmação:', err.message);
    }
  }

  /**
   * Realiza o lançamento financeiro na tabela daily_records
   */
  recordPixDirect(value, senderName, date) {
    try {
      // Buscar registro do dia
      let record = this.db.prepare('SELECT * FROM daily_records WHERE date = ?').get(date);
      
      const newEntry = {
        id: Date.now().toString(),
        desc: senderName || 'Cliente WhatsApp',
        val: parseFloat(value)
      };

      if (!record) {
        // Criar novo registro para hoje se não existir
        const id = `daily_${Date.now()}`;
        this.db.prepare(`
          INSERT INTO daily_records (id, date, expenses, nonRegistered, pixDiretoList, crediarioList, creditReceipts, sangrias, userName, lancado)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).run(
          id, 
          date, 
          JSON.stringify([]), 
          JSON.stringify([]), 
          JSON.stringify([newEntry]), 
          JSON.stringify([]), 
          JSON.stringify([]), 
          JSON.stringify([]), 
          'Robô de PIX'
        );
        console.log(`[PixBot] ✨ Novo registro diário criado para ${date} com PIX de R$ ${value}`);
      } else {
        // Atualizar lista existente
        let pixList = [];
        try {
          pixList = JSON.parse(record.pixDiretoList || '[]');
        } catch (e) { pixList = []; }
        
        pixList.push(newEntry);

        this.db.prepare('UPDATE daily_records SET pixDiretoList = ? WHERE id = ?')
          .run(JSON.stringify(pixList), record.id);
        
        console.log(`[PixBot] 📈 PIX de R$ ${value} adicionado ao registro diário de ${date}`);
      }
    } catch (err) {
      console.error('[PixBot] Erro ao realizar lançamento financeiro:', err.message);
    }
  }
}

module.exports = PixBotService;
