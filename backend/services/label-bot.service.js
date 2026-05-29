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
      let directMatch = this.db.prepare('SELECT * FROM stock_products WHERE code = ?').get(cleanBarcode);
      
      // Fallback: busca por substring no código de barras (útil para variações com/sem zero à esquerda)
      if (!directMatch && cleanBarcode.length >= 6) {
        directMatch = this.db.prepare('SELECT * FROM stock_products WHERE code LIKE ?').get(`%${cleanBarcode}%`);
      }
      
      if (directMatch) {
        console.log(`[LabelBot] 🎯 Correspondência de código de barras encontrada: ${directMatch.code}`);
        return directMatch;
      }
    }

    // 2. Busca por aproximação textual inteligente
    if (!searchName || searchName.length < 3) return null;

    // Configurações de Tokens de Tamanho e Stop Words em Português
    const SIZE_TOKENS = new Set(['p', 'm', 'g', 'gg', 'rn']);
    const STOP_WORDS = new Set([
      'de', 'do', 'da', 'dos', 'das', 'em', 'um', 'uma', 'uns', 'umas', 
      'o', 'a', 'os', 'as', 'e', 'para', 'com', 'sem', 'sob', 'sobre',
      'outros', 'perfumaria', 'higiene', 'beleza', 'st', 'generico'
    ]);

    // Dicionário bidirecional de equivalências farmacêuticas de abreviações brasileiras
    const SYNONYMS = {
      // Fraldas
      'fralda': ['fralda'], 'fraldas': ['fralda'], 'fr': ['fralda', 'frasco'],
      // Shampoo
      'shampoo': ['shampoo'], 'shamp': ['shampoo'], 'sh': ['shampoo'], 'xamp': ['shampoo'],
      // Creme / Condicionador / Sabonete / Gel
      'creme': ['creme'], 'crem': ['creme'], 'cr': ['creme'],
      'condicionador': ['condicionador'], 'cond': ['condicionador'], 'condic': ['condicionador'],
      'sabonete': ['sabonete'], 'sab': ['sabonete'],
      'hidratante': ['hidratante'], 'hidr': ['hidratante'], 'hidrat': ['hidratante'],
      'gel': ['gel'],
      // Xaropes e Soluções
      'xarope': ['xarope'], 'xpe': ['xarope'], 'xar': ['xarope'],
      'solucao': ['solucao'], 'solucoes': ['solucao'], 'sol': ['solucao'], 'soluc': ['solucao'],
      'suspensao': ['suspensao'], 'susp': ['suspensao'],
      'gotas': ['gotas'], 'gts': ['gotas'], 'gt': ['gotas'],
      'colirio': ['colirio'], 'col': ['colirio'],
      // Comprimidos / Cápsulas / Drágeas / Envelopes
      'comprimido': ['comprimido'], 'comprimidos': ['comprimido'], 'cpr': ['comprimido'], 'cp': ['comprimido'], 'comp': ['comprimido'], 'cprs': ['comprimido'], 'cps': ['comprimido'],
      'capsula': ['capsula'], 'capsulas': ['capsula'], 'cap': ['capsula'], 'caps': ['capsula'],
      'dragea': ['comprimido'], 'drageas': ['comprimido'], 'drg': ['comprimido'], 'drgs': ['comprimido'],
      'envelope': ['envelope'], 'envelopes': ['envelope'], 'env': ['envelope'],
      'pastilha': ['pastilha'], 'past': ['pastilha'],
      // Formatos / Recipientes
      'frasco': ['frasco'], 'frascos': ['frasco'], 'frc': ['frasco'],
      'ampola': ['ampola'], 'ampolas': ['ampola'], 'amp': ['ampola'],
      'pomada': ['pomada'], 'pom': ['pomada'],
      'caixa': ['caixa'], 'cx': ['caixa'],
      // Unidades / Quantidades
      'unidade': ['unidade'], 'unidades': ['unidade'], 'un': ['unidade'], 'und': ['unidade'], 'unid': ['unidade'],
      'g': ['grama'], 'gr': ['grama'], 'grama': ['grama'], 'gramas': ['grama'],
      'ml': ['mililítro'], 'mls': ['mililítro'],
      // Uso / Público
      'adulto': ['adulto'], 'adt': ['adulto'], 'ad': ['adulto'],
      'infantil': ['infantil'], 'inf': ['infantil'], 'pediatrico': ['infantil'], 'ped': ['infantil'],
      // Vários / Conectivos
      'com': ['com'], 'c/': ['com'], 'c': ['com'], 'contem': ['com'],
      'para': ['para'], 'p/': ['para'], 'p': ['para', 'p_size'],
      'injetavel': ['injetavel'], 'inj': ['injetavel'], 'injet': ['injetavel'],
      'desodorante': ['desodorante'], 'des': ['desodorante'], 'desod': ['desodorante'],
      'protetor': ['protetor'], 'prot': ['protetor'],
      // Controle / Queda
      'controle': ['controle'], 'control': ['controle'], 'cont': ['controle'],
      // Relaxante / Relax
      'relaxante': ['relaxante'], 'relax': ['relaxante'], 'relax.': ['relaxante']
    };

    // Helper de normalização inteligente
    const normalizeText = (str) => {
      if (!str) return '';
      return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/(\d+)([a-zA-Z]+)/g, '$1 $2')
        .replace(/([a-zA-Z]+)(\d+)/g, '$1 $2')
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    };

    // Helper de tokenização
    const tokenize = (str) => {
      return normalizeText(str).split(' ').filter(t => t && !STOP_WORDS.has(t));
    };

    // Helper de matching de equivalências
    const tokensMatch = (tokenA, tokenB) => {
      if (tokenA === tokenB) return true;
      const canonicalA = SYNONYMS[tokenA] || [tokenA];
      const canonicalB = SYNONYMS[tokenB] || [tokenB];
      for (const a of canonicalA) {
        if (canonicalB.includes(a)) return true;
      }
      return false;
    };

    // Helper de cálculo de peso do token (números e tamanhos têm extrema relevância)
    const getTokenWeight = (token) => {
      if (/^\d+$/.test(token)) return 6;
      if (SIZE_TOKENS.has(token)) return 5;
      if (token.length >= 5) return 4;
      if (token.length === 4) return 3;
      if (token.length === 3) return 2;
      return 1;
    };

    // Helper de pontuação de correspondência em duas vias
    const calculateMatchScore = (queryTokens, candidateName) => {
      const candidateTokens = tokenize(candidateName);
      if (queryTokens.length === 0 || candidateTokens.length === 0) return 0;
      
      // 1. Relevância da query para o candidato
      let totalQueryWeight = 0;
      let queryMatchedWeight = 0;
      
      for (const qToken of queryTokens) {
        const weight = getTokenWeight(qToken);
        totalQueryWeight += weight;
        
        let isMatched = false;
        for (const cToken of candidateTokens) {
          if (tokensMatch(qToken, cToken)) {
            isMatched = true;
            break;
          }
        }
        if (isMatched) {
          queryMatchedWeight += weight;
        }
      }
      
      const queryScore = queryMatchedWeight / totalQueryWeight;

      // 2. Relevância do candidato para a query (essencial para queries verbosas vs nomes curtos)
      let totalCandidateWeight = 0;
      let candidateMatchedWeight = 0;
      
      for (const cToken of candidateTokens) {
        const weight = getTokenWeight(cToken);
        totalCandidateWeight += weight;
        
        let isMatched = false;
        for (const qToken of queryTokens) {
          if (tokensMatch(qToken, cToken)) {
            isMatched = true;
            break;
          }
        }
        if (isMatched) {
          candidateMatchedWeight += weight;
        }
      }
      
      const candidateScore = candidateMatchedWeight / totalCandidateWeight;
      
      // Usa o maior score entre as duas visões
      let score = Math.max(queryScore, candidateScore);
      
      // Penalidade leve por termos avulsos/sobressalentes no candidato
      let unmatchedCandidateCount = 0;
      for (const cToken of candidateTokens) {
        let matched = false;
        for (const qToken of queryTokens) {
          if (tokensMatch(qToken, cToken)) {
            matched = true;
            break;
          }
        }
        if (!matched) unmatchedCandidateCount++;
      }
      
      const penalty = Math.min(unmatchedCandidateCount * 0.02, 0.20);
      score = Math.max(0, score - penalty);
      return score;
    };

    const queryTokens = tokenize(searchName);
    if (queryTokens.length === 0) return null;

    // 3. Busca no SQLite usando os principais termos significativos ordenados por relevância
    const sigTokens = queryTokens.filter(t => t.length >= 3 && !STOP_WORDS.has(t));
    sigTokens.sort((a, b) => b.length - a.length);

    let candidates = [];
    if (sigTokens.length > 0) {
      // Usa até os 6 termos mais longos para ampliar o recall da busca
      const topTokens = sigTokens.slice(0, 6);
      const conditions = topTokens.map(() => 'name LIKE ?').join(' OR ');
      const params = topTokens.map(t => `%${t}%`);
      candidates = this.db.prepare(`SELECT * FROM stock_products WHERE ${conditions}`).all(...params);
    }

    // Se a busca por termos específicos for vazia, busca todo o catálogo pequeno como fallback
    if (candidates.length === 0) {
      candidates = this.db.prepare('SELECT * FROM stock_products').all();
    }

    // 4. Calcular e classificar pontuações
    const scoredCandidates = candidates.map(prod => {
      const score = calculateMatchScore(queryTokens, prod.name);
      return { product: prod, score };
    });

    const threshold = 0.45;
    const validMatches = scoredCandidates.filter(c => c.score >= threshold);

    if (validMatches.length === 0) {
      console.log(`[LabelBot] ⚠️ Nenhuma correspondência determinística forte para "${searchName}". Tentando IA semântica como fallback...`);
      // Usa os top 15 candidatos (mesmo com score baixo) para a IA avaliar
      const topCandidates = scoredCandidates.sort((a,b) => b.score - a.score).slice(0, 15).map(c => c.product);
      if (topCandidates.length > 0) {
        const aiMatch = await this.findBestStockMatchWithAI(searchName, topCandidates);
        if (aiMatch) {
           console.log(`[LabelBot] 🤖 Correspondência semântica via IA encontrada: "${aiMatch.name}"`);
           return aiMatch;
        }
      }
      return null;
    }

    // Classifica por score desc, diferença de comprimento do nome e quantidade em estoque
    validMatches.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const diffA = Math.abs(a.product.name.length - searchName.length);
      const diffB = Math.abs(b.product.name.length - searchName.length);
      if (diffA !== diffB) {
        return diffA - diffB;
      }
      return b.product.stock_qty - a.product.stock_qty;
    });

    const bestMatch = validMatches[0];
    console.log(`[LabelBot] 🎯 Correspondência determinística de estoque encontrada: "${bestMatch.product.name}" com score ${bestMatch.score.toFixed(4)}`);
    return bestMatch.product;
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
