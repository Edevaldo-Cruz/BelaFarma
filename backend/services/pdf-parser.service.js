const fs = require('fs');
const pdf = require('pdf-parse');
const { callAI } = require('./ai.service');

/**
 * Serviço de Importação Inteligente de Estoque via PDF
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

    console.log(`[PdfParser] 📄 Iniciando leitura do PDF: ${pdfPath}`);
    const dataBuffer = fs.readFileSync(pdfPath);
    
    // 1. Extrair o texto bruto do PDF
    const parsedPdf = await pdf(dataBuffer);
    const rawText = parsedPdf.text;
    console.log(`[PdfParser] 📝 PDF lido. Tamanho do texto extraído: ${rawText.length} caracteres.`);

    // 2. Dividir em linhas e limpar vazias
    const lines = rawText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 5); // Descarta linhas irrelevantes/muito curtas

    console.log(`[PdfParser] 📊 Total de linhas relevantes identificadas: ${lines.length}`);

    if (lines.length === 0) {
      throw new Error('Nenhum texto legível foi extraído do PDF.');
    }

    // 3. Processar em lotes (ex: 80 linhas por lote)
    const BATCH_SIZE = 80;
    const totalLines = lines.length;
    const productsToInsert = [];

    // Limpar o progresso inicial
    if (onProgress) onProgress(0, 'Analisando dados do PDF...');

    for (let i = 0; i < totalLines; i += BATCH_SIZE) {
      const batchLines = lines.slice(i, i + BATCH_SIZE);
      const batchText = batchLines.join('\n');
      const progressPercent = Math.min(Math.round((i / totalLines) * 100), 95);

      if (onProgress) {
        onProgress(
          progressPercent, 
          `Processando lote ${Math.floor(i / BATCH_SIZE) + 1} de ${Math.ceil(totalLines / BATCH_SIZE)}...`
        );
      }

      console.log(`[PdfParser] 🤖 Processando lote de linhas ${i} a ${Math.min(i + BATCH_SIZE, totalLines)}...`);

      try {
        const parsedBatch = await this.parseBatchWithAI(batchText);
        if (Array.isArray(parsedBatch)) {
          productsToInsert.push(...parsedBatch);
          console.log(`[PdfParser] ✅ Lote processado. Extraídos ${parsedBatch.length} produtos.`);
        }
      } catch (err) {
        console.error(`[PdfParser] ⚠️ Falha ao processar lote ${i}-${i + BATCH_SIZE}:`, err.message);
        // Continua processando os outros lotes em caso de erro individual
      }
    }

    // 4. Gravar no Banco de Dados em uma única transação ultra-rápida
    if (productsToInsert.length === 0) {
      throw new Error('A Inteligência Artificial não conseguiu estruturar nenhum produto do PDF.');
    }

    console.log(`[PdfParser] 💾 Gravando ${productsToInsert.length} produtos no banco de dados SQLite...`);
    if (onProgress) onProgress(95, 'Gravando dados no banco de dados...');

    const now = new Date().toISOString();

    const insertOrReplace = this.db.prepare(`
      INSERT OR REPLACE INTO stock_products (code, name, sale_price, cost_price, stock_qty, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Executa a limpeza e inserção em uma transação
    const transaction = this.db.transaction((products) => {
      // Opcional: Limpar catálogo anterior para refletir exatamente a folha atual
      this.db.prepare('DELETE FROM stock_products').run();
      
      let count = 0;
      for (const prod of products) {
        // Validação mínima para evitar dados corrompidos
        if (!prod.code || !prod.name || isNaN(Number(prod.sale_price))) {
          continue; 
        }
        
        insertOrReplace.run(
          prod.code.toString().trim(),
          prod.name.toString().trim(),
          parseFloat(prod.sale_price),
          prod.cost_price ? parseFloat(prod.cost_price) : null,
          prod.stock_qty ? parseInt(prod.stock_qty, 10) : null,
          now
        );
        count++;
      }
      return count;
    });

    const insertedCount = transaction(productsToInsert);
    console.log(`[PdfParser] 🎉 Importação concluída! ${insertedCount} produtos salvos.`);
    
    if (onProgress) onProgress(100, `Concluído! ${insertedCount} produtos importados com sucesso.`);

    return insertedCount;
  }

  /**
   * Envia as linhas de texto bruto para a IA parsear estruturadamente
   */
  async parseBatchWithAI(batchText) {
    const prompt = `
      Você é um assistente de extração de dados farmacêuticos especializado em relatórios de estoque em PDF.
      Analise o texto abaixo, que representa linhas extraídas de um relatório de estoque, e converta-o em um array JSON plano de produtos.

      DADOS A EXTRAIR DE CADA LINHA:
      1. code: Código de barras EAN (13 dígitos) ou código interno numérico do produto (geralmente o primeiro número da linha).
      2. name: Nome completo do produto, incluindo dosagem, fabricante e apresentação (ex: "Dipirona 500mg Medley 10 CP").
      3. sale_price: Preço de venda ao consumidor final (número decimal, use ponto como separador).
      4. cost_price: Preço de custo pago pela farmácia, se presente na linha (nulo se não houver).
      5. stock_qty: Quantidade atual em estoque, se presente na linha (nulo se não houver).

      REGRAS CRÍTICAS:
      - Descarte linhas que sejam cabeçalhos, rodapés ou termos como "Relatório de Estoque", "Página", "Total Geral".
      - Se a linha não contiver um produto válido com preço de venda, ignore-a.
      - Retorne EXATAMENTE o array JSON, sem blocos de código markdown (como \`\`\`json), sem textos explicativos antes ou depois.

      EXEMPLO DE RETORNO ESPERADO:
      [
        { "code": "7891010101010", "name": "Dipirona 500mg Medley 10 CP", "sale_price": 12.50, "cost_price": 6.20, "stock_qty": 45 }
      ]

      TEXTO DO PDF A PARSEAR:
      ${batchText}
    `;

    const response = await callAI(prompt, "Você é um extrator de relatórios JSON rigoroso e preciso.", {
      temperature: 0.0, // 0.0 garante precisão matemática e sem alucinações
      maxTokens: 4096
    });

    try {
      // Limpa markdown se a IA ignorou a regra e colocou
      const cleanJson = response
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      
      return JSON.parse(cleanJson);
    } catch (e) {
      console.error('[PdfParser] Falha ao parsear resposta JSON da IA:', response);
      return [];
    }
  }
}

module.exports = PdfParserService;
