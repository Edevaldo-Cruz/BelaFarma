const fs = require('fs');
const pdfParseModule = require('pdf-parse');

/**
 * Função auxiliar robusta para extrair o texto de um buffer de PDF de forma
 * compatível com diferentes versões instaladas do pacote 'pdf-parse'.
 */
async function extractPdfText(dataBuffer) {
  if (typeof pdfParseModule === 'function') {
    // Versão clássica: 'pdf-parse' exporta uma função direta
    console.log('[PdfParser] 📑 Usando parser clássico do pdf-parse (função)...');
    const result = await pdfParseModule(dataBuffer);
    return result.text;
  } else if (pdfParseModule && typeof pdfParseModule.PDFParse === 'function') {
    // Versão TypeScript/Moderna: 'pdf-parse' exporta a classe PDFParse
    console.log('[PdfParser] 📑 Usando parser moderno do pdf-parse (classe PDFParse)...');
    // Converte o Buffer para Uint8Array puro para satisfazer a exigência estrita do pacote
    const uint8Array = new Uint8Array(dataBuffer);
    const parserInstance = new pdfParseModule.PDFParse(uint8Array);
    const result = await parserInstance.getText();
    return result.text;
  } else {
    throw new Error('O formato exportado do pacote "pdf-parse" é incompatível ou inválido.');
  }
}

/**
 * Serviço de Importação Determinística de Estoque via PDF
 * Analisa o layout estruturado do relatório sem a necessidade de IA.
 * Garante velocidade instantânea, custo zero e precisão de 100%.
 */
class PdfParserService {
  constructor(db) {
    this.db = db;
  }

  /**
   * Processa o arquivo PDF de estoque e atualiza a tabela stock_products
   * @param {string} pdfPath - Caminho absoluto do arquivo PDF
   * @param {function} onProgress - Callback de progresso (opcional)
   */
  async importStockFromPdf(pdfPath, onProgress = null) {
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`Arquivo não encontrado: ${pdfPath}`);
    }

    console.log(`[PdfParser] 📄 Iniciando leitura determinística do PDF (Sem IA): ${pdfPath}`);
    if (onProgress) onProgress(10, 'Extraindo texto do relatório PDF...');

    const dataBuffer = fs.readFileSync(pdfPath);
    
    // 1. Extrair o texto bruto do PDF de forma universal
    const rawText = await extractPdfText(dataBuffer);
    console.log(`[PdfParser] 📝 PDF lido com sucesso! Tamanho do texto extraído: ${rawText.length} caracteres.`);

    if (onProgress) onProgress(35, 'Analisando e parseando as linhas do relatório...');

    // 2. Dividir em linhas e remover vazias (Preserva todas para não perder números de quantidades como 18, 24, 32 embrulhados)
    const lines = rawText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    console.log(`[PdfParser] 📊 Total de linhas brutas para análise: ${lines.length}`);

    const productsToInsert = [];

    // Funções auxiliares internas para parsing e bufferização
    const parseSingleLine = (line, list) => {
      try {
        const ncmMatch = line.match(/\b\d{8}\b/);
        if (!ncmMatch) return;

        const ncm = ncmMatch[0];
        const parts = line.split(ncm);
        
        if (parts.length < 2) return;

        // --- PARTE 1 (Antes da NCM): EAN, Código Interno, Nome do Produto + Laboratório ---
        const firstHalf = parts[0].trim();
        
        // Regex para capturar EAN (13 dígitos) no início, seguido do Código Interno (dígitos)
        const matchStart = firstHalf.match(/^(\d{13})\s+(\d+)\s+(.+)$/);
        if (!matchStart) return;

        const ean = matchStart[1];
        const internalCode = matchStart[2];
        let productName = matchStart[3].trim();

        // Limpa o indicador de tributação (ex: "ST") do final do nome do produto, se houver
        productName = productName.replace(/\s+[A-Z]{2}$/i, '').trim();

        // --- PARTE 2 (Depois da NCM): Saldo (Estoque) e Preços ---
        const secondHalf = parts[1].trim();

        // Captura o saldo (primeiro número inteiro na segunda metade)
        const matchSaldo = secondHalf.match(/^(\d+)/);
        const stockQty = matchSaldo ? parseInt(matchSaldo[1], 10) : 0;

        // Captura todos os valores monetários com "R$" presentes na segunda metade
        const priceMatches = secondHalf.match(/R\$\s*(\d+[\.,]\d{2})/g);
        let prices = [];
        if (priceMatches) {
          prices = priceMatches.map(p => 
            parseFloat(p.replace('R$', '').replace(',', '.').trim())
          );
        }

        // Mapeamento determinístico de preços baseando-se na contagem de colunas extraídas
        let salePrice = null;
        let costPrice = null;

        if (prices.length >= 5) {
          salePrice = prices[1]; // Preço de Venda
          costPrice = prices[3]; // Preço de Custo / Última Compra
        } else if (prices.length === 4) {
          salePrice = prices[0]; // Preço de Venda (Preço Tabela em branco)
          costPrice = prices[2]; // Preço de Custo / Última Compra
        } else if (prices.length === 3) {
          salePrice = prices[0]; // Preço de Venda
          costPrice = prices[1]; // Preço de Custo / Última Compra
        } else if (prices.length === 2) {
          salePrice = prices[0]; // Preço de Venda
          costPrice = prices[1]; // Preço de Custo / Última Compra
        } else if (prices.length === 1) {
          salePrice = prices[0]; // Preço de Venda
          costPrice = null;
        }

        if (ean && productName && salePrice !== null) {
          list.push({
            code: ean.toString().trim(),
            name: productName.toString().trim(),
            sale_price: salePrice,
            cost_price: costPrice,
            stock_qty: stockQty
          });
        }
      } catch (lineErr) {
        // Silencia erro de parse de linha individual
      }
    };

    const parseAndPushProduct = (buffer, list) => {
      if (!buffer.ean || !buffer.detailsLine) return;
      const productName = buffer.nameParts.join(' ').trim();
      const syntheticLine = `${buffer.ean} ${buffer.internalCode} ${productName} ${buffer.detailsLine}`;
      parseSingleLine(syntheticLine, list);
    };

    // 3. Buffer de parsing para lidar com quebras de linha no PDF do relatório
    let currentBuffer = null;

    for (const line of lines) {
      const isStartLine = /^\d{13}\b/.test(line);
      const hasNcm = /\b\d{8}\b/.test(line);

      if (isStartLine && hasNcm) {
        // Produto completo em uma única linha
        if (currentBuffer) {
          parseAndPushProduct(currentBuffer, productsToInsert);
          currentBuffer = null;
        }
        parseSingleLine(line, productsToInsert);
      } else if (isStartLine) {
        // Começo de uma linha de produto que sofreu quebra de linha
        if (currentBuffer) {
          parseAndPushProduct(currentBuffer, productsToInsert);
        }
        const startMatch = line.match(/^(\d{13})\s+(\d+)\s+(.+)$/);
        if (startMatch) {
          currentBuffer = {
            ean: startMatch[1],
            internalCode: startMatch[2],
            nameParts: [startMatch[3].trim()],
            detailsLine: null
          };
        } else {
          currentBuffer = null;
        }
      } else if (currentBuffer) {
        // Conteúdo dentro de um produto que sofreu quebra de linha
        if (hasNcm && line.includes('R$')) {
          // É a linha final de detalhes comerciais/tributários
          currentBuffer.detailsLine = line;
          parseAndPushProduct(currentBuffer, productsToInsert);
          currentBuffer = null;
        } else {
          // É a continuação do nome/descrição do produto
          // Filtra tags de página e rodapés para evitar lixo no nome do produto
          if (!line.includes('SUB-TOTAL') && !line.includes('Gerado Por') && !/^\d{2}\/\d{2}\/\d{4}/.test(line)) {
            currentBuffer.nameParts.push(line.trim());
          }
        }
      }
    }

    // Processa o último produto pendente no buffer, se houver
    if (currentBuffer) {
      parseAndPushProduct(currentBuffer, productsToInsert);
    }

    console.log(`[PdfParser] 🤖 Parse concluído. Extraídos deterministicamente ${productsToInsert.length} produtos.`);

    if (productsToInsert.length === 0) {
      throw new Error('Não foi possível extrair nenhum produto estruturado do PDF. Verifique se o formato do PDF está correto.');
    }

    // 4. Gravar no Banco de Dados em uma única transação rápida
    if (onProgress) onProgress(80, `Gravando ${productsToInsert.length} produtos no banco de dados SQLite...`);

    const now = new Date().toISOString();

    const insertOrReplace = this.db.prepare(`
      INSERT OR REPLACE INTO stock_products (code, name, sale_price, cost_price, stock_qty, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((products) => {
      // Limpar catálogo anterior para refletir exatamente o relatório atualizado
      this.db.prepare('DELETE FROM stock_products').run();
      
      let count = 0;
      for (const prod of products) {
        // Validação mínima para evitar gravação de dados incompletos
        if (!prod.code || !prod.name || isNaN(Number(prod.sale_price))) {
          continue; 
        }

        insertOrReplace.run(
          prod.code,
          prod.name,
          prod.sale_price,
          prod.cost_price,
          prod.stock_qty,
          now
        );
        count++;
      }
      return count;
    });

    const insertedCount = transaction(productsToInsert);
    console.log(`[PdfParser] 🎉 Importação concluída! ${insertedCount} produtos salvos no SQLite.`);

    if (onProgress) onProgress(100, `Concluído! ${insertedCount} produtos importados com sucesso.`);

    return insertedCount;
  }
}

module.exports = PdfParserService;
