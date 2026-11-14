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
 * Suporta sincronização imediata no Digifarma (Firebird) e geração de tarefa de saneamento
 * @param {Object} param0 
 * @returns {Promise<Object>} Produto cadastrado pronto para adicionar ao carrinho
 */
async function cadastrarProdutoExpresso({ 
  name, 
  sale_price, 
  cost_price = 0,
  barcode_read = '', 
  category = 'cosmetico', 
  ncm = '',
  cest = '',
  sync_to_digifarma = true,
  user_name = 'Caixa' 
}) {
  initErpDatabase();

  const nomeLimpo = String(name || '').trim().toUpperCase();
  const precoVenda = Math.max(0.01, parseFloat(sale_price) || 0);
  const precoCusto = Math.max(0, parseFloat(cost_price) || 0);
  const barcode = String(barcode_read || '').trim();
  const catInfo = NCMS_PROVISORIOS[category.toLowerCase()] || NCMS_PROVISORIOS['cosmetico'];
  const ncmFinal = String(ncm || catInfo.ncm || '33049990').replace(/\D/g, '').slice(0, 8);
  const cestFinal = String(cest || '').replace(/\D/g, '').slice(0, 7);

  if (!nomeLimpo) {
    throw new Error('O nome do produto é obrigatório para o cadastro.');
  }

  // Gera um código sequencial interno único
  const timestamp = Date.now().toString().slice(-6);
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  const productCode = `EXP${timestamp}${randomSuffix}`;

  // Se o código de barras bipado for vazio ou inválido, usa o código interno
  const barcodeFinal = barcode || productCode;

  let digifarmaResult = null;
  let digiProductId = null;

  // 1. Sincronização direta com o Digifarma se solicitado
  if (sync_to_digifarma) {
    try {
      const maxIdRows = await queryDigifarma('SELECT COALESCE(MAX(PRODUTO_ID), 0) AS MAX_ID FROM PRODUTOS', [], 8000);
      const nextId = (maxIdRows && maxIdRows[0] && maxIdRows[0].MAX_ID ? parseInt(maxIdRows[0].MAX_ID, 10) : 100000) + 1;
      
      const isMonofasico = (category === 'cosmetico' || category === 'medicamento') ? 'S' : 'N';
      const catId = category === 'medicamento' ? 2 : (category === 'acessorio' ? 7 : 6);

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
          TRIBUTACAO_MONOFASICA,
          FORNECEDOR_ID,
          CATEGORIA_ID,
          TRIBUTACAO_ID,
          PADRAO_COMISSAO_ID,
          CST_PIS,
          CST_COFINS
        ) VALUES (
          ${nextId},
          '${nomeLimpo.replace(/'/g, "''").slice(0, 60)}',
          '${barcodeFinal.replace(/'/g, '').slice(0, 20)}',
          '${ncmFinal}',
          ${cestFinal ? `'${cestFinal}'` : 'NULL'},
          ${precoVenda.toFixed(2)},
          ${precoCusto.toFixed(2)},
          ${precoCusto.toFixed(2)},
          ${precoCusto.toFixed(2)},
          1.000,
          'S',
          '${isMonofasico}',
          232,
          ${catId},
          1,
          2,
          '01',
          '01'
        )
      `;

      await queryDigifarma(insertSql, [], 10000);
      digiProductId = nextId;
      digifarmaResult = { success: true, digifarma_product_id: nextId };
      console.log(`[Cadastro Expresso] ✅ Produto inserido com sucesso no Digifarma (PRODUTO_ID = ${nextId})`);
    } catch (errDigi) {
      console.warn('[Cadastro Expresso] ⚠️ Digifarma indisponível ou falhou, mantendo produto em fila para saneamento:', errDigi.message);
      digifarmaResult = { success: false, error: errDigi.message };
    }
  }

  const isSynced = digifarmaResult && digifarmaResult.success ? 1 : 0;
  const taskStatus = isSynced ? 'SANEADO' : 'PENDENTE';

  // 2. Cria a tarefa na fila de saneamento fiscal
  const stmtTask = db.prepare(`
    INSERT INTO product_sanitization_tasks (
      product_code, barcode_read, product_name, sale_price, cost_price,
      ncm_provisional, ncm_definitive, cest_definitive, category, status,
      digifarma_synced, digifarma_product_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
  `);

  const taskResult = stmtTask.run(
    productCode,
    barcodeFinal,
    nomeLimpo,
    precoVenda,
    precoCusto,
    catInfo.ncm,
    ncmFinal,
    cestFinal || null,
    catInfo.descricao,
    taskStatus,
    isSynced,
    digiProductId
  );

  const taskId = taskResult.lastInsertRowid;

  // 3. Se a tabela 'products' existir no banco principal (SQLite), insere ou atualiza
  try {
    const hasProducts = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='products'").get();
    if (hasProducts) {
      db.prepare(`
        INSERT OR REPLACE INTO products (
          code, barcode, name, sale_price, cost_price, ncm,
          stock_qty, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 999, 1, datetime('now', 'localtime'), datetime('now', 'localtime'))
      `).run(
        digiProductId ? String(digiProductId) : productCode,
        barcodeFinal,
        nomeLimpo,
        precoVenda,
        precoCusto,
        ncmFinal
      );
    }
  } catch (err) {
    console.warn('[Cadastro Expresso] Aviso ao registrar em products:', err.message);
  }

  console.log(`[Cadastro Expresso] ⚡ Produto criado: "${nomeLimpo}" (R$ ${precoVenda.toFixed(2)}) - Código: ${digiProductId || productCode} - Tarefa #${taskId}`);

  return {
    id: digiProductId ? String(digiProductId) : productCode,
    code: digiProductId ? String(digiProductId) : productCode,
    product_code: productCode,
    digifarma_product_id: digiProductId,
    name: nomeLimpo,
    product_name: nomeLimpo,
    barcode: barcodeFinal,
    price: precoVenda,
    sale_price: precoVenda,
    cost_price: precoCusto,
    unit_price: precoVenda,
    ncm: ncmFinal,
    cest: cestFinal,
    category: catInfo.descricao,
    is_provisional: !isSynced,
    sem_gtin: !barcode,
    digifarma_synced: isSynced,
    digifarma: digifarmaResult,
    task_id: taskId
  };
}

/**
 * Lista as tarefas de saneamento fiscal
 * @param {Object} options
 * @returns {Array} Lista de tarefas
 */
function listarTarefasSaneamento(options = {}) {
  initErpDatabase();
  const status = typeof options === 'string' ? options : (options?.status || 'TODOS');
  const query = typeof options === 'object' ? (options?.query || '') : '';
  const limit = typeof options === 'object' ? (parseInt(options?.limit, 10) || 200) : 200;

  let sql = 'SELECT * FROM product_sanitization_tasks WHERE 1=1';
  const params = [];

  if (status && status !== 'TODOS') {
    sql += ' AND status = ?';
    params.push(status);
  }

  const cleanQ = (query || '').trim();
  if (cleanQ) {
    sql += ' AND (product_name LIKE ? OR barcode_read LIKE ? OR product_code LIKE ?)';
    const pStr = `%${cleanQ}%`;
    params.push(pStr, pStr, pStr);
  }

  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(limit);
  return db.prepare(sql).all(...params);
}

/**
 * Retorna contadores gerais das tarefas de saneamento
 */
function obterResumoTarefasSaneamento() {
  initErpDatabase();
  const pendentes = db.prepare("SELECT COUNT(*) as c FROM product_sanitization_tasks WHERE status = 'PENDENTE'").get()?.c || 0;
  const saneados = db.prepare("SELECT COUNT(*) as c FROM product_sanitization_tasks WHERE status = 'SANEADO'").get()?.c || 0;
  const total = db.prepare("SELECT COUNT(*) as c FROM product_sanitization_tasks").get()?.c || 0;
  return { total, pendentes, saneados };
}

/**
 * Atualiza os dados de um produto expresso
 */
function atualizarTarefaSaneamento(id, dados = {}) {
  initErpDatabase();
  const task = db.prepare('SELECT * FROM product_sanitization_tasks WHERE id = ?').get(id);
  if (!task) throw new Error(`Produto expresso #${id} não encontrado.`);

  const nome = dados.product_name ? String(dados.product_name).trim().toUpperCase() : task.product_name;
  const precoVenda = dados.sale_price !== undefined ? Math.max(0.01, parseFloat(dados.sale_price) || 0) : task.sale_price;
  const precoCusto = dados.cost_price !== undefined ? Math.max(0, parseFloat(dados.cost_price) || 0) : task.cost_price;
  const barcode = dados.barcode_read !== undefined ? String(dados.barcode_read).trim() : task.barcode_read;
  const ncmDef = dados.ncm_definitive !== undefined ? (dados.ncm_definitive ? String(dados.ncm_definitive).replace(/\D/g, '') : null) : task.ncm_definitive;
  const cestDef = dados.cest_definitive !== undefined ? (dados.cest_definitive ? String(dados.cest_definitive).replace(/\D/g, '') : null) : task.cest_definitive;
  const categoria = dados.category || task.category;
  const status = dados.status || task.status;

  db.prepare(`
    UPDATE product_sanitization_tasks
    SET product_name = ?,
        sale_price = ?,
        cost_price = ?,
        barcode_read = ?,
        ncm_definitive = ?,
        cest_definitive = ?,
        category = ?,
        status = ?,
        updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(nome, precoVenda, precoCusto, barcode, ncmDef, cestDef, categoria, status, id);

  // Sincroniza alterações na tabela products nativa do ERP
  try {
    db.prepare(`
      UPDATE products
      SET name = ?,
          sale_price = ?,
          cost_price = ?,
          barcode = ?,
          ncm = COALESCE(?, ncm),
          cest = COALESCE(?, cest),
          updated_at = datetime('now', 'localtime')
      WHERE code = ?
    `).run(nome, precoVenda, precoCusto, barcode, ncmDef, cestDef, task.product_code);
  } catch (eSync) {}

  return db.prepare('SELECT * FROM product_sanitization_tasks WHERE id = ?').get(id);
}

/**
 * Remove um produto expresso e seu registro provisório no catálogo
 */
function excluirTarefaSaneamento(id) {
  initErpDatabase();
  const task = db.prepare('SELECT * FROM product_sanitization_tasks WHERE id = ?').get(id);
  if (!task) throw new Error(`Produto expresso #${id} não encontrado.`);

  db.prepare('DELETE FROM product_sanitization_tasks WHERE id = ?').run(id);

  try {
    if (task.product_code && task.product_code.startsWith('EXP')) {
      db.prepare('DELETE FROM products WHERE code = ?').run(task.product_code);
    }
  } catch (eDel) {}

  return { success: true, id, product_code: task.product_code };
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
 * Sincroniza a tabela DESCONTO_ESCALONADO e promoções Pague/Leve do Digifarma para o SQLite local
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

  // Busca também promoções do tipo Leve X Pague Y cadastradas diretamente em PRODUTOS
  let regrasPagueLeve = [];
  try {
    regrasPagueLeve = await queryDigifarma(`
      SELECT 
        PRODUTO_ID,
        PRODUTO,
        COD_BARRAS,
        PROD_PRVENDA,
        PROMOCAO_PAGUE,
        PROMOCAO_LEVE
      FROM PRODUTOS
      WHERE PROMOCAO_PAGUE > 0 
        AND PROMOCAO_LEVE > PROMOCAO_PAGUE
        AND PROD_ATIVO = 'S'
        AND PROD_PRVENDA > 0
    `, [], 20000);
  } catch (errPagueLeve) {
    console.warn('[Preços Escalonados] Aviso ao buscar PROMOCAO_PAGUE/LEVE:', errPagueLeve.message);
  }

  const todasRegras = [];
  if (Array.isArray(regrasDigi)) {
    for (const r of regrasDigi) {
      todasRegras.push({
        digifarma_id: r.DESCONTO_ESCALONADO_ID,
        product_id: r.PRODUTO_ID,
        product_code: String(r.PRODUTO_ID),
        product_name: r.PRODUTO ? String(r.PRODUTO).trim() : 'PRODUTO',
        barcode: r.COD_BARRAS ? String(r.COD_BARRAS).trim() : null,
        quantity: parseInt(r.QUANTIDADE, 10),
        package_price: parseFloat(r.VALOR_PACOTE)
      });
    }
  }

  if (Array.isArray(regrasPagueLeve)) {
    for (const p of regrasPagueLeve) {
      const pague = parseFloat(p.PROMOCAO_PAGUE);
      const leve = parseInt(p.PROMOCAO_LEVE, 10);
      const precoVenda = parseFloat(p.PROD_PRVENDA) || 0;
      if (leve > 1 && pague > 0 && precoVenda > 0) {
        const pacote = Math.round(pague * precoVenda * 100) / 100;
        // Evita duplicar se já existir em DESCONTO_ESCALONADO
        const jaExiste = todasRegras.some(r => r.product_id === p.PRODUTO_ID && r.quantity === leve);
        if (!jaExiste) {
          todasRegras.push({
            digifarma_id: 900000 + p.PRODUTO_ID, // ID virtual para Pague/Leve
            product_id: p.PRODUTO_ID,
            product_code: String(p.PRODUTO_ID),
            product_name: p.PRODUTO ? String(p.PRODUTO).trim() : 'PRODUTO',
            barcode: p.COD_BARRAS ? String(p.COD_BARRAS).trim() : null,
            quantity: leve,
            package_price: pacote
          });
        }
      }
    }
  }

  if (todasRegras.length === 0) {
    return { success: true, total: 0, message: 'Nenhuma regra de preço escalonado encontrada no Digifarma.' };
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO tiered_pricing (
      digifarma_id, product_id, product_code, barcode, product_name,
      quantity, package_price, unit_effective_price, active, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now', 'localtime'))
  `);

  const tx = db.transaction((regras) => {
    let inseridos = 0;
    for (const r of regras) {
      const qtd = r.quantity;
      const pkgPrice = r.package_price;
      const unitEff = qtd > 0 ? (pkgPrice / qtd) : pkgPrice;
      const codBarras = r.barcode || null;
      const nomeProd = r.product_name || 'PRODUTO';
      const prodCode = r.product_code || String(r.product_id);

      stmt.run(
        r.digifarma_id,
        r.product_id,
        prodCode,
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

  const totalSincronizados = tx(todasRegras);
  console.log(`[Preços Escalonados] ✅ ${totalSincronizados} regras de preço escalonado sincronizadas com sucesso!`);

  return {
    success: true,
    total_regras: totalSincronizados,
    data: new Date().toISOString()
  };
}

let hasTriggeredAutoSyncTiered = false;

/**
 * Obtém todas as regras ativas de preços escalonados para uso no PDV dentro da vigência
 * @returns {Array} Regras ativas
 */
function obterPrecosEscalonados() {
  initErpDatabase();
  const d = new Date();
  const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  let rows = db.prepare(`
    SELECT * FROM tiered_pricing 
    WHERE active = 1 
      AND (is_permanent = 1 OR end_date IS NULL OR end_date >= ?)
      AND (start_date IS NULL OR start_date <= ?)
    ORDER BY product_id ASC, quantity DESC
  `).all(hoje, hoje);

  if (rows.length === 0) {
    try {
      const seedRules = require('./tiered-pricing-seed.json');
      if (Array.isArray(seedRules) && seedRules.length > 0) {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO tiered_pricing (
            digifarma_id, product_id, barcode, product_name,
            quantity, package_price, unit_effective_price, active, is_permanent, synced_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, datetime('now', 'localtime'))
        `);
        const tx = db.transaction((list) => {
          for (const r of list) {
            stmt.run(
              r.digifarma_id,
              r.product_id,
              r.barcode,
              r.product_name,
              r.quantity,
              r.package_price,
              r.unit_effective_price
            );
          }
        });
        tx(seedRules);
        rows = db.prepare(`
          SELECT * FROM tiered_pricing 
          WHERE active = 1 
          ORDER BY product_id ASC, quantity DESC
        `).all();
        console.log(`[Preços Escalonados] 🌱 ${rows.length} regras carregadas via seed automático.`);
      }
    } catch (e) {
      console.warn('[Preços Escalonados] Erro ao carregar seed:', e.message);
    }
  }

  if (!hasTriggeredAutoSyncTiered) {
    hasTriggeredAutoSyncTiered = true;
    sincronizarPrecosEscalonadosDigifarma().catch(() => {});
  }

  return rows;
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
  obterResumoTarefasSaneamento,
  atualizarTarefaSaneamento,
  excluirTarefaSaneamento,
  sanearProdutoECadastrarDigifarma,
  sincronizarPrecosEscalonadosDigifarma,
  obterPrecosEscalonados,
  calcularDescontoEscalonado,
  NCMS_PROVISORIOS
};
