const { callAI } = require('./ai.service');

async function processIncomingMessage(db, phone, cleanText, pushName, sock) {
  try {
    // 1. Verificar se o número pertence a algum fornecedor local
    const localSupplier = db.prepare('SELECT id, digifarma_id, representante FROM local_suppliers WHERE telefone LIKE ? OR telefone = ?').get(`%${phone}%`, phone);
    if (!localSupplier) return; // Não é fornecedor

    // 2. Verificar se existe cotação ativa para este fornecedor (status 'Enviada')
    const activeQuotes = db.prepare(`
      SELECT id, productName, rawMessage 
      FROM quotations 
      WHERE supplierId = ? AND status = 'Enviada'
      ORDER BY createdAt DESC
    `).all(localSupplier.digifarma_id);

    if (activeQuotes.length === 0) return; // Nenhuma cotação aguardando resposta

    console.log(`[QuotationService] 🛒 Resposta recebida do fornecedor ${pushName} (${phone}) para cotação.`);

    // 3. Processar o texto com IA para extrair preço ou classificar como dúvida
    const prompt = `Você é um assistente de cotações. Analise a seguinte resposta de um fornecedor de farmácia.
O fornecedor está respondendo sobre a cotação de ${activeQuotes.length} produto(s): ${activeQuotes.map(q => q.productName).join(', ')}.

Mensagem do fornecedor: "${cleanText}"

Sua tarefa: 
1. Se a mensagem informar o preço claramente de algum item, extraia os valores.
2. Se a mensagem for uma dúvida (ex: "Qual laboratório?", "Quantas caixas?"), classifique como DÚVIDA.

Responda OBRIGATORIAMENTE num formato JSON válido:
{
  "type": "PRICE" ou "DOUBT" ou "UNKNOWN",
  "reason": "Explicação breve",
  "prices": {
     "Nome do Produto": 12.50
  }
}
Se for DOUBT, deixe "prices" vazio. Formate os valores numéricos como decimais (ex: 12.50).`;

    const aiResponse = await callAI(prompt, 'Você responde apenas em JSON.', { temperature: 0.2 });
    
    let json;
    try {
      json = JSON.parse(aiResponse.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (e) {
      console.error('[QuotationService] Erro ao parsear JSON da IA:', aiResponse);
      return;
    }

    // 4. Atualizar o banco de dados
    if (json.type === 'DOUBT') {
      console.log(`[QuotationService] ⚠️ Fornecedor enviou uma DÚVIDA: ${cleanText}`);
      // Atualiza todas as cotações pendentes daquele fornecedor para 'Dúvida do Fornecedor'
      for (const quote of activeQuotes) {
        db.prepare('UPDATE quotations SET status = ?, updatedAt = ? WHERE id = ?')
          .run('Dúvida do Fornecedor', new Date().toISOString(), quote.id);
      }
    } else if (json.type === 'PRICE' && json.prices) {
      console.log(`[QuotationService] ✅ IA extraiu preços:`, json.prices);
      
      // Para cada preço extraído, tentar dar match com a cotação aberta
      for (const [prodName, price] of Object.entries(json.prices)) {
        // Encontrar a cotação correspondente
        const quote = activeQuotes.find(q => q.productName.toLowerCase().includes(prodName.toLowerCase()) || prodName.toLowerCase().includes(q.productName.toLowerCase()));
        
        if (quote) {
          db.prepare('UPDATE quotations SET status = ?, quotedPrice = ?, updatedAt = ? WHERE id = ?')
            .run('Respondida', parseFloat(price), new Date().toISOString(), quote.id);
        }
      }
      
      // Enviar uma mensagem de agradecimento genérica
      await sock.sendMessage(`${phone}@s.whatsapp.net`, { text: 'Recebido! Muito obrigada pela cotação. Vou repassar para aprovação. 😊' });
    }

  } catch (err) {
    console.error('[QuotationService] Erro ao processar mensagem do fornecedor:', err.message);
  }
}

module.exports = {
  processIncomingMessage
};
