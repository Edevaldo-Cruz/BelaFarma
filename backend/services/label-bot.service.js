const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { callAI } = require('./ai.service');

// Inicializa a instância do OpenAI de forma preguiçosa (evita erros caso a chave falte na inicialização)
let openai = null;
function getOpenAI() {
  if (!openai && process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

/**
 * Serviço Inteligente de Processamento de Etiquetas Belinha
 */
class LabelBotService {
  constructor(db) {
    this.db = db;
    this.pendingPrices = new Map(); // phone -> { name, barcode, quantity, originalPrice }
  }

  /**
   * Processa uma entrada multimodal (Texto, Imagem ou Áudio) vinda do WhatsApp
   * @param {Object} options - Parâmetros de entrada
   * @param {string} options.phone - Número do WhatsApp do remetente
   * @param {string} [options.text] - Mensagem de texto enviada
   * @param {string} [options.imageBase64] - Imagem em base64 (caso foto)
   * @param {string} [options.imageMime] - Mimetype da imagem
   * @param {Buffer} [options.audioBuffer] - Buffer do áudio recebido (caso áudio)
   * @returns {Promise<{success: boolean, replyText: string, label?: Object}>}
   */
  async processWhatsAppInput({ phone, text, imageBase64, imageMime, audioBuffer }) {
    console.log(`[LabelBot] 📥 Processando entrada de ${phone}. TemTexto: ${!!text}, TemImagem: ${!!imageBase64}, TemAudio: ${!!audioBuffer}`);

    try {
      // ── VERIFICA SE É RESPOSTA DE PREÇO PENDENTE ──
      if (text && !imageBase64 && !audioBuffer) {
        const cleanText = text.toLowerCase().trim();
        const priceMatch = cleanText.match(/^(?:preço|preco)\s*(?:r\$\s*)?(\d+[\.,]\d{2})/i);
        
        if (priceMatch && this.pendingPrices.has(phone)) {
          const typedPrice = parseFloat(priceMatch[1].replace(',', '.'));
          const pending = this.pendingPrices.get(phone);
          
          this.pendingPrices.delete(phone); // Limpa o estado pendente
          
          console.log(`[LabelBot] 💰 Preço digitado recebido de ${phone}: R$ ${typedPrice} para o produto ${pending.name}`);
          
          // Insere na fila de impressão
          const labelId = `label_${Date.now()}`;
          this.db.prepare(`
            INSERT INTO label_print_queue (id, product_name, price, original_price, barcode, quantity, status, source, phone, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            labelId,
            pending.name,
            typedPrice,
            pending.originalPrice,
            pending.barcode,
            pending.quantity,
            'Pendente',
            'whatsapp_text',
            phone,
            new Date().toISOString()
          );

          const replyText = `🏷️ *Etiqueta Agendada com Sucesso (Preço Informado)!*\n\n` +
                          `📦 *Produto:* ${pending.name}\n` +
                          `💰 *Preço:* R$ ${typedPrice.toFixed(2)}\n` +
                          `📋 *Quantidade:* ${pending.quantity} cópia(s)\n` +
                          `🔢 *Cód. Barras (EAN):* ${pending.barcode || '_Não informado_'}\n\n` +
                          `🖥️ _A etiqueta já está na Estação de Impressão no painel do sistema!_`;

          return {
            success: true,
            replyText,
            label: { id: labelId, name: pending.name, price: typedPrice, barcode: pending.barcode, quantity: pending.quantity }
          };
        }
      }

      let extractedData = null;
      let source = 'whatsapp_text';

      // 1. PROCESSAR SE FOR ÁUDIO (Transcrição + Extração)
      if (audioBuffer) {
        source = 'whatsapp_audio';
        console.log(`[LabelBot] 🎙️ Áudio recebido. Iniciando transcrição...`);
        const transcription = await this.transcribeOggAudio(audioBuffer);
        console.log(`[LabelBot] 📝 Transcrição obtida: "${transcription}"`);
        
        extractedData = await this.extractProductInfoFromText(transcription);
        if (extractedData) {
          extractedData.transcription = transcription;
        }
      }
      // 2. PROCESSAR SE FOR IMAGEM (Análise de Visão Computacional)
      else if (imageBase64) {
        source = 'whatsapp_image';
        console.log(`[LabelBot] 📸 Foto recebida. Iniciando análise visual...`);
        extractedData = await this.extractProductInfoFromImage(imageBase64, imageMime);
      }
      // 3. PROCESSAR SE FOR TEXTO SIMPLES
      else if (text) {
        source = 'whatsapp_text';
        extractedData = await this.extractProductInfoFromText(text);
      }

      if (!extractedData) {
        return {
          success: false,
          replyText: '❌ Desculpe, não consegui entender as informações do produto. Certifique-se de mandar o nome do produto de forma clara, ou uma foto legível da caixinha.'
        };
      }

      console.log('[LabelBot] 🔍 Dados extraídos pela IA:', extractedData);

      // 4. AUTOCOMPLETAR DADOS VIA BANCO DE DADOS (Pesquisa no Estoque do PDF)
      const matchedProduct = await this.lookupProductInStock(extractedData.name, extractedData.barcode);

      let finalName = extractedData.name;
      let finalPrice = extractedData.price;
      let finalBarcode = extractedData.barcode || '';
      let usedStockPrice = false;

      if (matchedProduct) {
        console.log(`[LabelBot] 🎯 Correspondência de Estoque encontrada:`, matchedProduct);
        finalName = matchedProduct.name; // Usa o nome padronizado do estoque
        finalBarcode = matchedProduct.code; // Preenche o EAN do estoque
        
        // Se o usuário não informou o preço no WhatsApp, ou se quisermos usar o preço oficial do estoque
        if (!finalPrice || finalPrice <= 0) {
          finalPrice = matchedProduct.sale_price;
          usedStockPrice = true;
        }
      }

      // Se mesmo após a pesquisa não temos o preço, precisamos pedir ao usuário
      if (!finalPrice || finalPrice <= 0) {
        const quantity = extractedData.quantity || 1;
        const originalPrice = extractedData.original_price || null;
        
        this.pendingPrices.set(phone, {
          name: finalName,
          barcode: finalBarcode,
          quantity: quantity,
          originalPrice: originalPrice
        });

        return {
          success: false,
          replyText: `🔍 Identifiquei o produto *"${finalName}"*, mas não encontrei um preço de venda cadastrado para ele no estoque.\n\nPor favor, envie o preço digitando: *Preço R$ XX,XX*`
        };
      }

      // 5. INSERIR NA FILA DE IMPRESSÃO (label_print_queue)
      const labelId = `label_${Date.now()}`;
      const quantity = extractedData.quantity || 1;
      const originalPrice = extractedData.original_price || null;

      this.db.prepare(`
        INSERT INTO label_print_queue (id, product_name, price, original_price, barcode, quantity, status, source, phone, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        labelId,
        finalName,
        finalPrice,
        originalPrice,
        finalBarcode,
        quantity,
        'Pendente',
        source,
        phone,
        new Date().toISOString()
      );

      console.log(`[LabelBot] 🏷️ Etiqueta enfileirada com sucesso: ID=${labelId}, Qtd=${quantity}`);

      // 6. FORMULÁRIO DE RETORNO DO WHATSAPP (Mensagem de Sucesso Amigável)
      let replyText = `🏷️ *Etiqueta Agendada com Sucesso!*\n\n` +
                      `📦 *Produto:* ${finalName}\n` +
                      `💰 *Preço:* R$ ${finalPrice.toFixed(2)}\n`;

      if (originalPrice) {
        replyText += `❌ *De:* ~~R$ ${originalPrice.toFixed(2)}~~\n`;
      }

      replyText += `📋 *Quantidade:* ${quantity} cópia(s)\n` +
                  `🔢 *Cód. Barras (EAN):* ${finalBarcode || '_Não informado_'}\n\n`;

      if (usedStockPrice) {
        replyText += `💡 _Preço de R$ ${finalPrice.toFixed(2)} autocompletado do PDF de estoque importado._\n\n`;
      }

      if (extractedData.transcription) {
        replyText += `🎙️ _Entendido por áudio:_ "${extractedData.transcription}"\n\n`;
      }

      replyText += `🖥️ _A etiqueta já está na Estação de Impressão no painel do sistema!_`;

      return {
        success: true,
        replyText,
        label: { id: labelId, name: finalName, price: finalPrice, barcode: finalBarcode, quantity }
      };

    } catch (err) {
      console.error('[LabelBot] 💥 Erro catastrófico no processamento do robô:', err.message);
      return {
        success: false,
        replyText: `⚠️ Desculpe, ocorreu um erro interno ao processar a etiqueta: ${err.message}`
      };
    }
  }

  /**
   * Transcreve um áudio OGG recebido em Buffer usando OpenAI Whisper
   */
  async transcribeOggAudio(audioBuffer) {
    const api = getOpenAI();
    if (!api) {
      throw new Error('Serviço de transcrição OpenAI Whisper não configurado (chave ausente).');
    }

    const tempDir = path.join(__dirname, '..', 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempPath = path.join(tempDir, `audio_${Date.now()}.ogg`);
    fs.writeFileSync(tempPath, audioBuffer);

    try {
      const response = await api.audio.transcriptions.create({
        file: fs.createReadStream(tempPath),
        model: 'whisper-1',
        language: 'pt'
      });
      return response.text;
    } finally {
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (e) {}
      }
    }
  }

  /**
   * Extrai dados de produtos a partir de um texto livre
   */
  async extractProductInfoFromText(text) {
    const prompt = `
      Você é um robô de Inteligência Artificial especializado em processar pedidos de etiquetas de farmácia por texto ou fala.
      Analise o texto abaixo e extraia as propriedades do produto para a etiqueta.

      TEXTO ENVIADO:
      "${text}"

      REGRAS DE EXTRAÇÃO:
      1. name: Nome comercial do produto, dosagem, fabricante e apresentação (ex: "Dipirona 500mg Medley 10 CP"). Tente deduzir e corrigir erros de digitação comuns de farmácia.
      2. price: Preço de venda ao consumidor. Se não for especificado, retorne nulo.
      3. original_price: Se for mencionado um preço promocional ("De R$ X por R$ Y"), extraia o preço antigo X como original_price e o preço de venda Y como price.
      4. barcode: Código de barras EAN-13 (13 dígitos) se mencionado de alguma forma no texto.
      5. quantity: Quantidade de cópias de etiqueta pedida. Padrão é 1 se não for mencionado ("me faz 3 etiquetas do X" -> quantity = 3).

      Responda EXATAMENTE no formato JSON plano abaixo (sem markdown, sem textos extras):
      {
        "name": "...",
        "price": 0.0 || null,
        "original_price": 0.0 || null,
        "barcode": "..." || null,
        "quantity": 1
      }
    `;

    const response = await callAI(prompt, "Você é um extrator JSON preciso de medicamentos.", {
      temperature: 0.0
    });

    try {
      const cleanJson = response.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson);
    } catch (e) {
      console.error('[LabelBot] Erro ao parsear texto extraído:', response);
      return null;
    }
  }

  /**
   * Extrai dados de produtos a partir de uma foto usando visão computacional (Gemini Vision)
   */
  async extractProductInfoFromImage(base64Image, mimeType) {
    const prompt = `
      Você é um farmacêutico e auditor de preços ultra experiente.
      Analise esta imagem que mostra a embalagem de um produto de farmácia ou uma etiqueta de preço antiga.
      Extraia os detalhes para gerar uma nova etiqueta de preço.

      DADOS A BUSCAR NA IMAGEM:
      1. Nome comercial do produto, dosagem, marca e quantidade de comprimidos/ML (ex: "Dorflex 10 Comprimidos", "Tylenol Gotas 15ml").
      2. Preço: Se houver uma etiqueta antiga com preço colada, ou preço sugerido impresso na caixa, extraia-o. Caso contrário, retorne null.
      3. Código de barras EAN: Se o código de barras de 13 dígitos estiver visível de frente, leia os números na base das barras pretas e coloque em barcode. Caso contrário, retorne null.

      Responda EXATAMENTE no formato JSON plano abaixo (sem markdown, sem textos extras):
      {
        "name": "Nome do Produto Detectado",
        "price": 0.0 || null,
        "original_price": null,
        "barcode": "789..." || null,
        "quantity": 1
      }
    `;

    const response = await callAI(prompt, "Você é um leitor de embalagens farmacêuticas preciso.", {
      imageData: base64Image,
      mimeType: mimeType || 'image/jpeg',
      temperature: 0.0
    });

    try {
      const cleanJson = response.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson);
    } catch (e) {
      console.error('[LabelBot] Erro ao parsear visão de imagem:', response);
      return null;
    }
  }

  /**
   * Busca no catálogo SQLite o melhor produto correspondente
   */
  async lookupProductInStock(searchName, searchBarcode) {
    // 1. Busca por código de barras direto se foi fornecido
    if (searchBarcode) {
      const cleanBarcode = searchBarcode.toString().trim();
      const directMatch = this.db.prepare('SELECT * FROM stock_products WHERE code = ?').get(cleanBarcode);
      if (directMatch) return directMatch;
    }

    // 2. Busca por aproximação textual na tabela
    if (!searchName || searchName.length < 3) return null;

    // Busca rápida usando LIKE nas primeiras palavras
    const firstWord = searchName.split(' ')[0].trim();
    const potentialMatches = this.db.prepare(`
      SELECT * FROM stock_products 
      WHERE name LIKE ? OR name LIKE ? 
      LIMIT 15
    `).all(`%${searchName}%`, `%${firstWord}%`);

    if (potentialMatches.length === 0) return null;
    if (potentialMatches.length === 1) return potentialMatches[0];

    // 3. Se houver múltiplos matches, usa a IA para selecionar o melhor item de estoque
    return this.findBestStockMatchWithAI(searchName, potentialMatches);
  }

  /**
   * Usa IA para decidir qual produto de estoque é a melhor correspondência semântica
   */
  async findBestStockMatchWithAI(userQuery, stockList) {
    const productsJson = stockList.map(p => ({
      code: p.code,
      name: p.name,
      sale_price: p.sale_price
    }));

    const prompt = `
      Você é um motor de busca semântica de produtos de farmácia.
      O usuário buscou por: "${userQuery}".
      
      No nosso banco de dados, encontramos os seguintes produtos candidatos:
      ${JSON.stringify(productsJson, null, 2)}

      Decida qual destes produtos é exatamente o mesmo que o usuário busca, considerando a dosagem, fabricante e grafia mais próxima.
      Se nenhum deles for correspondente, responda null.
      
      Responda EXATAMENTE com o objeto JSON do produto selecionado (do array candidate), ou null se nenhum servir. Sem markdown, sem texto extra.
    `;

    const response = await callAI(prompt, "Você é um selecionador semântico de produtos de farmácia preciso.", {
      temperature: 0.0
    });

    try {
      const cleanJson = response.replace(/```json/g, '').replace(/```/g, '').trim();
      if (cleanJson === 'null') return null;
      
      const selected = JSON.parse(cleanJson);
      // Retorna o produto original completo do stockList baseado no código
      return stockList.find(p => p.code === selected.code) || null;
    } catch (e) {
      // Em caso de erro na resposta da IA, retorna o primeiro match por segurança
      return stockList[0];
    }
  }
}

module.exports = LabelBotService;
