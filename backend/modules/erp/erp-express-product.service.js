/**
 * Belinha ERP - Express Product Registration & Tiered Pricing Service
 * 1. Cadastro Expresso de Produtos Provisórios (sem GTIN / Importados) no PDV
 * 2. Gestão da Fila de Saneamento Fiscal (Tarefas de Validação)
 * 3. Integração com DESCONTO_ESCALONADO do Digifarma (Preços Escalonados por Quantidade)
 * 4. Cadastro Definitivo no Digifarma (Firebird) pós-saneamento
 */

const { db, initErpDatabase } = require('./erp-database');
const { queryDigifarma } = require('../../services/digifarma.service');

// Tabela de NCMs provisórios seguros por categoria
const NCMS_PROVISORIOS = {
  'cosmetico': { ncm: '33049990', descricao: 'Perfumaria / Cosméticos / Higiene' },
  'acessorio': { ncm: '39269090', descricao: 'Acessórios / Cutelaria / Plásticos' },
  'medicamento': { ncm: '30049099', descricao: 'Medicamento / Outros Produtos' }
};

/**
 * Cadastra um produto expresso no PDV em menos de 5 segundos
 * @param {Object} param0 
 * @returns {Object} Produto cadastrado pronto para adicionar ao carrinho
 */
function cadastrarProdutoExpresso({ name, sale_price, barcode_read = '', category = 'cosmetico', user_name = 'Caixa' }) {
  initErpDatabase();

  const nomeLimpo = String(name || '').trim().toUpperCase();
  const precoVenda = Math.max(0.01, parseFloat(sale_price) || 0);
  const barcode = String(barcode_read || '').trim();
  const catInfo = NCMS_PROVISORIOS[category.toLowerCase()] || NCMS_PROVISORIOS['cosmetico'];

  if (!nomeLimpo) {
    throw new Error('O nome do produto é obrigatório para o cadastro expresso.');
  }

  // Gera um código sequencial interno único
  const timestamp = Date.now().toString().slice(-6);
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  const productCode = `EXP${timestamp}${randomSuffix}`;

  // Se o código de barras bipado for vazio ou inválido, usa o código interno
  const barcodeFinal = barcode || productCode;

  // 1. Cria a tarefa na fila de saneamento fiscal
  const stmtTask = db.prepare(`
    INSERT INTO product_sanitization_tasks (
      product_code, barcode_read, product_name, sale_price, cost_price,
      ncm_provisional, category, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 0, ?, ?, 'PENDENTE', datetime('now', 'localtime'), datetime('now', 'localtime'))
  `);

  const taskResult = stmtTask.run(
    productCode,
    barcodeFinal,
    nomeLimpo,
    precoVenda,
    catInfo.ncm,
    catInfo.descricao
  );

  const taskId = taskResult.lastInsertRowid;

  // 2. Se a tabela 'products' existir no banco principal (SQLite), insere ou atualiza
  try {
    const hasProducts = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='products'").get();
    if (hasProducts) {
      db.prepare(`
        INSERT OR REPLACE INTO products (
          code, barcode, name, sale_price, cost_price, ncm,
          stock_qty, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 0, ?, 999, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
      `).run(
        productCode,
        barcodeFinal,
        nomeLimpo,
        precoVenda,
        catInfo.ncm
      );
    }
  } catch (err) {
    console.warn('[Cadastro Expresso] Aviso ao registrar em products:', err.message);
  }

  console.log(`[Cadastro Expresso] ⚡ Produto provisório criado: "${nomeLimpo}" (R$ ${precoVenda.toFixed(2)}) - Código: ${productCode} - Tarefa #${taskId}`);

  return {
    id: productCode,
    code: productCode,
    product_code: productCode,
    name: nomeLimpo,
    product_name: nomeLimpo,
    barcode: barcodeFinal,
    price: precoVenda,
    sale_price: precoVenda,
    unit_price: precoVenda,
    ncm: catInfo.ncm,
    is_provisional: true,
    sem_gtin: true,
    task_id: taskId
  };
}

/**
 * Lista as tarefas de saneamento fiscal
 * @param {string} status 'TODOS' | 'PENDENTE' | 'SANEADO'
 * @returns {Array} Lista de tarefas
 */
function listarTarefasSaneamento(status = 'PENDENTE') {
  initErpDatabase();
  let sql = 'SELECT * FROM product_sanitization_tasks';
  const params = [];

  if (status && status !== 'TODOS') {
    sql += ' WHERE status = ?';
    params.push(status);
  }

  sql += ' ORDER BY id DESC LIMIT 200';
  return db.prepare(sql).all(...params);
}

/**
 * Salva a validação definitiva e opcionalmente cadastra no Digifarma
 * @param {number} taskId 
 * @param {Object} dadosValidados 
 * @returns {Promise<Object>}
 */
async function sanearProdutoECadastrarDigifarma(taskId, {
  ncm_definitive,
  cest_definitive = '',
  cost_price = 0,
  sale_price = null,
  product_name = null,
  sync_to_digifarma = true,
  user_name = 'Gerente'
}) {
  initErpDatabase();

  const task = db.prepare('SELECT * FROM product_sanitization_tasks WHERE id = ?').get(taskId);
  if (!task) {
    throw new Error(`Tarefa de saneamento #${taskId} não encontrada.`);
  }

  const ncmLimpo = String(ncm_definitive || '').replace(/\D/g, '');
  if (ncmLimpo.length !== 8) {
    throw new Error('NCM definitivo inválido. O NCM deve conter exatamente 8 dígitos.');
  }

  const precoCusto = parseFloat(cost_price) || 0;
  const precoVendaFinal = sale_price ? parseFloat(sale_price) : task.sale_price;
  const nomeFinal = product_name ? String(product_name).trim().toUpperCase() : task.product_name;

  let digifarmaResult = null;
  let digiProductId = task.digifarma_product_id;

  if (sync_to_digifarma) {
    try {
      // 1. Obtém o próximo PRODUTO_ID no Digifarma
      const maxIdRows = await queryDigifarma('SELECT COALESCE(MAX(PRODUTO_ID), 0) AS MAX_ID FROM PRODUTOS', [], 10000);
      const nextId = (maxIdRows && maxIdRows[0] && maxIdRows[0].MAX_ID ? parseInt(maxIdRows[0].MAX_ID, 10) : 100000) + 1;

      // 2. Insere na tabela PRODUTOS do Digifarma
      const insertSql = `
        INSERT INTO PRODUTOS (
          PRODUTO_ID,
          PRODUTO,
          COD_BARRAS,
          NCM,
          CEST,
          PROD_PRVENDA,
          PROD_PRCOMPRA,
          VALOR_ULT_COMPRA,
          PROD_CMV,
          PROD_SALDO,
          PROD_ATIVO,
          TRIBUTACAO_MONOFASICA
        ) VALUES (
          ${nextId},
          '${nomeFinal.replace(/'/g, "''").slice(0, 60)}',
          '${(task.barcode_read || task.product_code).replace(/'/g, '').slice(0, 20)}',
          '${ncmLimpo}',
          ${cest_definitive ? `'${String(cest_definitive).replace(/\D/g, '').slice(0, 7)}'` : 'NULL'},
          ${precoVendaFinal.toFixed(2)},
          ${precoCusto.toFixed(2)},
          ${precoCusto.toFixed(2)},
          ${precoCusto.toFixed(2)},
          1.000,
          'S',
          'N'
        )
      `;

      await queryDigifarma(insertSql, [], 15000);
      digiProductId = nextId;
      digifarmaResult = { success: true, digifarma_product_id: nextId };
      console.log(`[Saneamento] ✅ Produto #${task.product_code} inserido no Digifarma com PRODUTO_ID = ${nextId}`);
    } catch (err) {
      console.error('[Saneamento] ⚠️ Falha ao inserir produto no Digifarma:', err.message);
      digifarmaResult = { success: false, error: err.message };
    }
  }

  // Atualiza a tarefa no SQLite
  db.prepare(`
    UPDATE product_sanitization_tasks
    SET ncm_definitive = ?,
        cest_definitive = ?,
        cost_price = ?,
        sale_price = ?,
        product_name = ?,
        status = 'SANEADO',
        digifarma_synced = ?,
        digifarma_product_id = ?,
        validated_at = datetime('now', 'localtime'),
        validated_by = ?,
        updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(
    ncmLimpo,
    cest_definitive || null,
    precoCusto,
    precoVendaFinal,
    nomeFinal,
    digifarmaResult && digifarmaResult.success ? 1 : 0,
    digiProductId || null,
    user_name,
    taskId
  );

  return {
    success: true,
    task_id: taskId,
    product_code: task.product_code,
    ncm: ncmLimpo,
    digifarma: digifarmaResult
  };
}

/**
 * Sincroniza a tabela DESCONTO_ESCALONADO do Digifarma para o SQLite local
 * @returns {Promise<Object>} Resumo da sincronização
 */
async function sincronizarPrecosEscalonadosDigifarma() {
  initErpDatabase();

  console.log('[Preços Escalonados] 🔄 Buscando regras na tabela DESCONTO_ESCALONADO do Digifarma...');
  const regrasDigi = await queryDigifarma(`
    SELECT 
      D.DESCONTO_ESCALONADO_ID,
      D.PRODUTO_ID,
      D.QUANTIDADE,
      D.VALOR_PACOTE,
      P.PRODUTO,
      P.COD_BARRAS
    FROM DESCONTO_ESCALONADO D
    JOIN PRODUTOS P ON P.PRODUTO_ID = D.PRODUTO_ID
    WHERE D.QUANTIDADE > 1 AND D.VALOR_PACOTE > 0
  `, [], 20000);

  if (!regrasDigi || regrasDigi.length === 0) {
    return { success: true, total: 0, message: 'Nenhuma regra de preço escalonado encontrada no Digifarma.' };
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO tiered_pricing (
      digifarma_id, product_id, barcode, product_name,
      quantity, package_price, unit_effective_price, active, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now', 'localtime'))
  `);

  const tx = db.transaction((regras) => {
    let inseridos = 0;
    for (const r of regras) {
      const qtd = parseInt(r.QUANTIDADE, 10);
      const pkgPrice = parseFloat(r.VALOR_PACOTE);
      const unitEff = qtd > 0 ? (pkgPrice / qtd) : pkgPrice;
      const codBarras = r.COD_BARRAS ? String(r.COD_BARRAS).trim() : null;
      const nomeProd = r.PRODUTO ? String(r.PRODUTO).trim() : 'PRODUTO';

      stmt.run(
        r.DESCONTO_ESCALONADO_ID,
        r.PRODUTO_ID,
        codBarras,
        nomeProd,
        qtd,
        pkgPrice,
        unitEff
      );
      inseridos++;
    }
    return inseridos;
  });

  const totalSincronizados = tx(regrasDigi);
  console.log(`[Preços Escalonados] ✅ ${totalSincronizados} regras de preço escalonado sincronizadas com sucesso!`);

  return {
    success: true,
    total_regras: totalSincronizados,
    data: new Date().toISOString()
  };
}

/**
 * Obtém todas as regras ativas de preços escalonados para uso no PDV
 * @returns {Array} Regras ativas
 */
function obterPrecosEscalonados() {
  initErpDatabase();
  return db.prepare(`
    SELECT * FROM tiered_pricing 
    WHERE active = 1 
    ORDER BY product_id ASC, quantity DESC
  `).all();
}

/**
 * Calcula o preço unitário e o desconto de um item no carrinho com base em preços escalonados
 * @param {Object} item { barcode, product_id, quantity, unit_price }
 * @param {Array} regras Lista de regras carregadas
 * @returns {Object|null} Regra aplicada com economia e valor final
 */
function calcularDescontoEscalonado(item, regras = []) {
  if (!item || !item.quantity || item.quantity <= 1) return null;

  const barcodeItem = item.barcode ? String(item.barcode).trim() : null;
  const prodIdItem = item.product_id ? parseInt(item.product_id, 10) : null;
  const qtdItem = parseInt(item.quantity, 10);

  // Busca regras correspondentes ao produto
  const regrasProduto = regras.filter(r => 
    (barcodeItem && r.barcode === barcodeItem) ||
    (prodIdItem && r.product_id === prodIdItem)
  );

  if (regrasProduto.length === 0) return null;

  // Ordena da maior quantidade para a menor para pegar a melhor faixa elegível
  regrasProduto.sort((a, b) => b.quantity - a.quantity);

  // Encontra a melhor regra onde item.quantity >= r.quantity
  const regraAplicavel = regrasProduto.find(r => qtdItem >= r.quantity);
  if (!regraAplicavel) return null;

  // Preço normal total sem promoção
  const totalSemPromocao = item.unit_price * qtdItem;

  // Cálculo com pacote escalonado:
  // Ex: 3 unidades por 15. Se comprar 7 unidades: 2 pacotes de 3 (6 un a 30) + 1 avulsa no preço normal
  const pacotesCompletos = Math.floor(qtdItem / regraAplicavel.quantity);
  const unidadesAvulsas = qtdItem % regraAplicavel.quantity;

  const totalComPromocao = (pacotesCompletos * regraAplicavel.package_price) + (unidadesAvulsas * item.unit_price);
  const economia = Math.max(0, totalSemPromocao - totalComPromocao);

  if (economia <= 0.009) return null;

  return {
    regra_id: regraAplicavel.id,
    quantidade_gatilho: regraAplicavel.quantity,
    valor_pacote: regraAplicavel.package_price,
    total_com_promocao: Math.round(totalComPromocao * 100) / 100,
    economia: Math.round(economia * 100) / 100,
    preco_medio_unitario: Math.round((totalComPromocao / qtdItem) * 100) / 100,
    label: `${regraAplicavel.quantity} un por R$ ${regraAplicavel.package_price.toFixed(2)}`
  };
}

module.exports = {
  cadastrarProdutoExpresso,
  listarTarefasSaneamento,
  sanearProdutoECadastrarDigifarma,
  sincronizarPrecosEscalonadosDigifarma,
  obterPrecosEscalonados,
  calcularDescontoEscalonado,
  NCMS_PROVISORIOS
};
