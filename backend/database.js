const Database = require('better-sqlite3');
const config = require('./config.js');
config.log();

const DB_FILE = config.dbPath;

let db;

try {
  db = new Database(DB_FILE, process.env.DEBUG_SQL === 'true' ? { verbose: console.log } : {});
  console.log(`Conexão com o banco de dados SQLite estabelecida.`);
  
  // Ativa o modo WAL para melhor concorrência
  db.pragma('journal_mode = WAL');

  // Função para criar as tabelas
  const createTables = () => {
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        accessKey TEXT NOT NULL UNIQUE
      );
    `;

    const createOrdersTable = `
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        orderDate TEXT NOT NULL,
        distributor TEXT NOT NULL,
        seller TEXT,
        totalValue REAL NOT NULL,
        arrivalForecast TEXT,
        status TEXT NOT NULL,
        paymentMonth TEXT,
        invoiceNumber TEXT,
        paymentMethod TEXT NOT NULL,
        receiptDate TEXT,
        notes TEXT,
        installments TEXT, -- Armazenado como JSON
        isFogueteAmarelo INTEGER DEFAULT 0,
        boletoPath TEXT
      );
    `;

    const createShortagesTable = `
      CREATE TABLE IF NOT EXISTS shortages (
        id TEXT PRIMARY KEY,
        productName TEXT NOT NULL,
        type TEXT NOT NULL,
        clientInquiry INTEGER NOT NULL, -- 0 for false, 1 for true
        notes TEXT,
        createdAt TEXT NOT NULL,
        userName TEXT NOT NULL,
        purchased INTEGER DEFAULT 0,
        ordered INTEGER DEFAULT 0,
        saldo REAL DEFAULT 0,
        valorUltimaCompra REAL DEFAULT 0,
        history TEXT
      );
    `;

    const createLogsTable = `
      CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        userName TEXT NOT NULL,
        userId TEXT NOT NULL,
        action TEXT NOT NULL,
        category TEXT NOT NULL,
        details TEXT
      );
    `;

    const createCashClosingsTable = `
      CREATE TABLE IF NOT EXISTS cash_closings (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        totalSales REAL NOT NULL,
        initialCash REAL NOT NULL,
        receivedExtra REAL NOT NULL,
        totalDigital REAL NOT NULL,
        totalInDrawer REAL NOT NULL,
        difference REAL NOT NULL,
        safeDeposit REAL NOT NULL,
        expenses REAL NOT NULL,
        userName TEXT NOT NULL,
        credit REAL,
        debit REAL,
        pix REAL,
        pixDirect REAL,
        totalCrediario REAL,
        crediarioList TEXT,
        creditReceipts TEXT
      );
    `;

    const createTasksTable = `
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        assignedUser TEXT NOT NULL,
        creator TEXT NOT NULL,
        priority TEXT NOT NULL,
        status TEXT NOT NULL,
        dueDate TEXT NOT NULL,
        creationDate TEXT NOT NULL,
        color TEXT NOT NULL,
        isArchived INTEGER DEFAULT 0,
        completionDate TEXT,
        recurrenceType TEXT DEFAULT 'none',
        recurrenceInterval INTEGER DEFAULT 0,
        recurrenceDaysOfWeek TEXT DEFAULT '[]', -- JSON string "[0,1,2]"
        recurrenceDayOfMonth INTEGER DEFAULT 0,
        recurrenceMonthOfYear INTEGER DEFAULT 0,
        recurrenceEndDate TEXT,
        recurrenceId TEXT,
        originalDueDate TEXT,
        annotations TEXT DEFAULT '[]', -- JSON string of array of objects
        needsAdminAttention INTEGER DEFAULT 0, -- 0 for false, 1 for true
        adminAttentionMessage TEXT
      );
    `;

    const createCrediarioRecordsTable = `
      CREATE TABLE IF NOT EXISTS crediario_records (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        client TEXT NOT NULL,
        value REAL NOT NULL,
        userName TEXT NOT NULL
      );
    `;

    const createCheckingAccountTransactionsTable = `
      CREATE TABLE IF NOT EXISTS checking_account_transactions (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        description TEXT NOT NULL,
        type TEXT NOT NULL,
        value REAL NOT NULL,
        cashClosingId TEXT,
        FOREIGN KEY (cashClosingId) REFERENCES cash_closings(id)
      );
    `;

    const createBoletosTable = `
      CREATE TABLE IF NOT EXISTS boletos (
        id TEXT PRIMARY KEY,
        supplierName TEXT,
        order_id TEXT, -- Made nullable
        due_date TEXT NOT NULL,
        value REAL NOT NULL,
        status TEXT NOT NULL
        -- installment_number INTEGER, -- Removed
        -- invoice_number TEXT,     -- Removed
        -- boletoPath TEXT          -- Removed, as file upload is removed
        -- FOREIGN KEY (order_id) REFERENCES orders(id) -- Foreign key might need to be removed or adjusted if order_id is nullable
      );
    `;

    const createMonthlyLimitsTable = `
      CREATE TABLE IF NOT EXISTS monthly_limits (
        month INTEGER NOT NULL,
        year INTEGER NOT NULL,
        "limit" REAL NOT NULL,
        PRIMARY KEY (month, year)
      );
    `;

    const createDailyRecordsTable = `
      CREATE TABLE IF NOT EXISTS daily_records (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        expenses TEXT NOT NULL,
        nonRegistered TEXT NOT NULL,
        pixDiretoList TEXT,
        crediarioList TEXT,
        creditReceipts TEXT,
        sangrias TEXT, -- New column for sangrias
        userName TEXT NOT NULL,
        cashClosingId TEXT -- New column to link to cash closings
      );
    `;

    const createFixedAccountsTable = `
      CREATE TABLE IF NOT EXISTS fixed_accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        value REAL NOT NULL,
        dueDay INTEGER NOT NULL,
        isActive INTEGER DEFAULT 1
      );
    `;

    const createPixConfirmationsTable = `
      CREATE TABLE IF NOT EXISTS pix_confirmations (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        value REAL,
        senderName TEXT,
        pixDate TEXT,
        status TEXT NOT NULL,
        aiAnalysis TEXT,
        createdAt TEXT NOT NULL
      );
    `;

    const createFixedAccountPaymentsTable = `
      CREATE TABLE IF NOT EXISTS fixed_account_payments (
        id TEXT PRIMARY KEY,
        fixedAccountId TEXT NOT NULL,
        fixedAccountName TEXT NOT NULL,
        value REAL NOT NULL,
        dueDate TEXT NOT NULL,
        month TEXT NOT NULL,
        status TEXT NOT NULL,
        paidAt TEXT,
        notes TEXT,
        FOREIGN KEY (fixedAccountId) REFERENCES fixed_accounts(id)
      );
    `;
    console.log('Fixed account payments table verified/created.');

    // CRM Module Tables
    const createCustomersTable = `
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        nickname TEXT,
        cpf TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        notes TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `;

    const createCustomerDebtsTable = `
      CREATE TABLE IF NOT EXISTS customer_debts (
        id TEXT PRIMARY KEY,
        customerId TEXT NOT NULL,
        purchaseDate TEXT NOT NULL,
        description TEXT,
        totalValue REAL NOT NULL,
        status TEXT DEFAULT 'Pendente',
        paidAt TEXT,
        userName TEXT NOT NULL,
        FOREIGN KEY (customerId) REFERENCES customers(id) ON DELETE RESTRICT
      );
    `;

    const createCustomerRecipesTable = `
      CREATE TABLE IF NOT EXISTS customer_recipes (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL,
        doctor_name TEXT,
        medication_name TEXT,
        recipe_image_url TEXT NOT NULL,
        expiry_date TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
      );
    `;

    // Safe Entries Table
    const createSafeEntriesTable = `
      CREATE TABLE IF NOT EXISTS safe_entries (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        description TEXT NOT NULL,
        type TEXT CHECK(type IN ('Entrada', 'Saída')) NOT NULL,
        value REAL NOT NULL,
        userName TEXT,
        source_id TEXT, -- Para vincular a sangrias ou outros lançamentos
        parent_id TEXT -- Novo campo para vincular ao registro diário ou fechamento
      );
    `;

    // AI Cache Table
    const createAICacheTable = `
      CREATE TABLE IF NOT EXISTS ai_cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
    `;

    // Consignados Module Tables
    const createConsignadoSuppliersTable = `
      CREATE TABLE IF NOT EXISTS consignado_suppliers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        contact TEXT,
        pixKey TEXT,
        createdAt TEXT NOT NULL
      );
    `;

    // Purchasing (Isa-Compras) Tables
    const createSuppliersTable = `
      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        whatsapp TEXT NOT NULL,
        category TEXT NOT NULL, -- 'Medicamentos', 'Perfumaria', etc.
        createdAt TEXT NOT NULL
      );
    `;

    const createConsignadoProductsTable = `
      CREATE TABLE IF NOT EXISTS consignado_products (
        id TEXT PRIMARY KEY,
        supplierId TEXT NOT NULL,
        name TEXT NOT NULL,
        costPrice REAL NOT NULL,
        salePrice REAL NOT NULL,
        currentStock INTEGER NOT NULL DEFAULT 0,
        soldQty INTEGER NOT NULL DEFAULT 0,
        status TEXT DEFAULT 'Ativo',
        FOREIGN KEY (supplierId) REFERENCES consignado_suppliers(id) ON DELETE CASCADE
      );
    `;

    // Stock products and label printing queue tables
    const createStockProductsTable = `
      CREATE TABLE IF NOT EXISTS stock_products (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sale_price REAL NOT NULL,
        cost_price REAL,
        stock_qty INTEGER,
        updated_at TEXT NOT NULL
      );
    `;

    const createLabelPrintQueueTable = `
      CREATE TABLE IF NOT EXISTS label_print_queue (
        id TEXT PRIMARY KEY,
        product_name TEXT NOT NULL,
        price REAL NOT NULL,
        original_price REAL,
        barcode TEXT,
        quantity INTEGER DEFAULT 1,
        status TEXT DEFAULT 'Pendente',
        source TEXT,
        phone TEXT,
        created_at TEXT NOT NULL,
        printed_at TEXT
      );
    `;

    const createLocalSuppliersTable = `
      CREATE TABLE IF NOT EXISTS local_suppliers (
        id TEXT PRIMARY KEY,
        digifarma_id INTEGER UNIQUE,
        representante TEXT,
        telefone TEXT,
        prazo_boletos TEXT,
        createdAt TEXT
      );
    `;

    const createQuotationsTable = `
      CREATE TABLE IF NOT EXISTS quotations (
        id TEXT PRIMARY KEY,
        productName TEXT NOT NULL,
        supplierId TEXT,
        supplierName TEXT NOT NULL,
        supplierPhone TEXT,
        status TEXT NOT NULL, -- 'Enviada', 'Respondida', 'Dúvida do Fornecedor', 'Ignorada'
        quotedPrice REAL,
        rawMessage TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `;

    const createQuotationListsTable = `
      CREATE TABLE IF NOT EXISTS quotation_lists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT DEFAULT 'Aberta',
        createdAt TEXT NOT NULL
      );
    `;

    const createQuotationListItemsTable = `
      CREATE TABLE IF NOT EXISTS quotation_list_items (
        id TEXT PRIMARY KEY,
        listId TEXT NOT NULL,
        productId TEXT NOT NULL,
        productName TEXT NOT NULL,
        quantity INTEGER DEFAULT 1,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (listId) REFERENCES quotation_lists(id) ON DELETE CASCADE
      );
    `;

    const createAppointmentsTable = `
      CREATE TABLE IF NOT EXISTS appointments (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        startDate TEXT NOT NULL,
        endDate TEXT NOT NULL,
        allDay INTEGER DEFAULT 0,
        category TEXT DEFAULT 'Geral',
        color TEXT DEFAULT '#3B82F6',
        status TEXT DEFAULT 'Pendente',
        visibility TEXT DEFAULT 'Public',
        createdById TEXT NOT NULL,
        createdByName TEXT NOT NULL,
        assignedToId TEXT,
        assignedToName TEXT,
        customerId TEXT,
        customerName TEXT,
        supplierId TEXT,
        supplierName TEXT,
        location TEXT,
        recurrence TEXT DEFAULT 'none',
        recurrenceEndDate TEXT,
        reminderMinutes INTEGER DEFAULT 15,
        createdAt TEXT NOT NULL,
        updatedAt TEXT
      );
    `;

    const createAnvisaAlertsTable = `
      CREATE TABLE IF NOT EXISTS anvisa_alerts (
        id TEXT PRIMARY KEY,
        numero_resolucao TEXT NOT NULL,
        data_publicacao TEXT NOT NULL,
        nome_produto TEXT NOT NULL,
        fabricante TEXT,
        principio_ativo TEXT,
        motivo TEXT NOT NULL,
        tipo_acao TEXT DEFAULT 'Proibição',
        lote TEXT,
        ean TEXT,
        fonte_url TEXT,
        criado_em TEXT NOT NULL,
        verificado INTEGER DEFAULT 0,
        tem_estoque_manual INTEGER DEFAULT NULL,
        status_estoque TEXT DEFAULT 'semEstoque',
        match_score INTEGER DEFAULT 0,
        notificado INTEGER DEFAULT 0
      );
    `;

    const createMuralVariacaoPrecosTable = `
      CREATE TABLE IF NOT EXISTS mural_variacao_precos (
        id TEXT PRIMARY KEY,
        produto_id INTEGER NOT NULL,
        descricao TEXT NOT NULL,
        cod_barras TEXT,
        apresentacao TEXT,
        custo_anterior REAL DEFAULT 0,
        custo_novo REAL DEFAULT 0,
        variacao_percentual REAL DEFAULT 0,
        preco_venda_atual REAL DEFAULT 0,
        preco_venda_sugerido REAL DEFAULT 0,
        margem_atual REAL DEFAULT 0,
        margem_nova_se_manter REAL DEFAULT 0,
        fornecedor TEXT,
        nota_fiscal TEXT,
        data_entrada TEXT NOT NULL,
        status TEXT DEFAULT 'pendente',
        novo_preco_aplicado REAL,
        acao_tomada TEXT,
        resolvido_por TEXT,
        resolvido_em TEXT,
        created_at TEXT DEFAULT (datetime('now', 'localtime'))
      );
    `;

    // Executa as queries
    db.exec(createUsersTable);
    db.exec(createOrdersTable);
    db.exec(createShortagesTable);

    try { db.exec('ALTER TABLE shortages ADD COLUMN saldo REAL DEFAULT 0'); } catch(e) {}
    try { db.exec('ALTER TABLE shortages ADD COLUMN valorUltimaCompra REAL DEFAULT 0'); } catch(e) {}
    try { db.exec('ALTER TABLE shortages ADD COLUMN history TEXT'); } catch(e) {}
    db.exec(createLogsTable);
    db.exec(createCashClosingsTable);
    db.exec(createCrediarioRecordsTable);
    db.exec(createTasksTable);
    db.exec(createCheckingAccountTransactionsTable);
    db.exec(createSafeEntriesTable);
    db.exec(createAICacheTable);
    db.exec(createConsignadoSuppliersTable);
    db.exec(createConsignadoProductsTable);
    db.exec(createSuppliersTable);
    db.exec(createBoletosTable);
    db.exec(createMonthlyLimitsTable);
    db.exec(createDailyRecordsTable);
    db.exec(createFixedAccountsTable);
    db.exec(createFixedAccountPaymentsTable);
    db.exec(createPixConfirmationsTable);
    db.exec(createCustomersTable);
    db.exec(createCustomerDebtsTable);
    db.exec(createCustomerRecipesTable);
    db.exec(createStockProductsTable);
    db.exec(createLabelPrintQueueTable);
    db.exec(createLocalSuppliersTable);
    db.exec(createQuotationsTable);
    db.exec(createQuotationListsTable);
    db.exec(createQuotationListItemsTable);
    db.exec(createAppointmentsTable);
    db.exec(createAnvisaAlertsTable);
    db.exec(createMuralVariacaoPrecosTable);
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_mural_var_status ON mural_variacao_precos(status);'); } catch(e) {}
    try { db.exec('ALTER TABLE mural_variacao_precos ADD COLUMN preco_promocional REAL DEFAULT 0'); } catch(e) {}
    try { db.exec('ALTER TABLE mural_variacao_precos ADD COLUMN preco_venda_normal REAL DEFAULT 0'); } catch(e) {}
    try { db.exec('ALTER TABLE mural_variacao_precos ADD COLUMN is_promocao INTEGER DEFAULT 0'); } catch(e) {}

    // Price Manager: Snapshots de Backup e Reajustes Escalonados
    const createPriceSnapshotsTable = `
      CREATE TABLE IF NOT EXISTS price_change_snapshots (
        id TEXT PRIMARY KEY,
        produto_id INTEGER NOT NULL,
        descricao TEXT NOT NULL,
        cod_barras TEXT,
        preco_anterior REAL NOT NULL,
        novo_preco REAL NOT NULL,
        preco_custo REAL DEFAULT 0,
        tipo TEXT DEFAULT 'direto',
        motivo TEXT,
        usuario TEXT,
        data_alteracao TEXT DEFAULT (datetime('now', 'localtime')),
        revertido INTEGER DEFAULT 0,
        revertido_em TEXT,
        revertido_por TEXT
      );
    `;
    db.exec(createPriceSnapshotsTable);
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_snap_prod ON price_change_snapshots(produto_id);'); } catch(e) {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_snap_data ON price_change_snapshots(data_alteracao);'); } catch(e) {}

    const createPriceScheduledStepsTable = `
      CREATE TABLE IF NOT EXISTS price_scheduled_steps (
        id TEXT PRIMARY KEY,
        produto_id INTEGER NOT NULL,
        descricao TEXT NOT NULL,
        cod_barras TEXT,
        preco_inicial REAL NOT NULL,
        preco_alvo REAL NOT NULL,
        preco_atual REAL NOT NULL,
        max_pct_por_etapa REAL DEFAULT 5.0,
        intervalo_dias INTEGER DEFAULT 7,
        etapa_atual INTEGER DEFAULT 1,
        total_etapas INTEGER DEFAULT 1,
        proxima_execucao TEXT NOT NULL,
        status TEXT DEFAULT 'ativo',
        criado_por TEXT,
        criado_em TEXT DEFAULT (datetime('now', 'localtime')),
        ultima_atualizacao TEXT
      );
    `;
    db.exec(createPriceScheduledStepsTable);
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_sched_status ON price_scheduled_steps(status);'); } catch(e) {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_sched_exec ON price_scheduled_steps(proxima_execucao);'); } catch(e) {}

    // Digifarma Replication & Continuous Sync Tables
    const createDigifarmaSyncTables = `
      CREATE TABLE IF NOT EXISTS digifarma_sync_metadata (
        tabela TEXT PRIMARY KEY,
        ultima_sincronizacao TEXT,
        total_registros INTEGER DEFAULT 0,
        duracao_ms INTEGER DEFAULT 0,
        status TEXT DEFAULT 'ok',
        mensagem_erro TEXT
      );

      CREATE TABLE IF NOT EXISTS digifarma_crediario_cache (
        id TEXT PRIMARY KEY,
        cliente_id INTEGER,
        cliente_nome TEXT,
        telefone TEXT,
        valor REAL NOT NULL,
        data_compra TEXT,
        data_vencimento TEXT,
        venda_nota_id INTEGER,
        atualizado_em TEXT DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE IF NOT EXISTS digifarma_stock_summary_cache (
        id TEXT PRIMARY KEY DEFAULT 'current',
        total_ativos INTEGER DEFAULT 0,
        total_saidas_mes REAL DEFAULT 0,
        qtd_parados_90d INTEGER DEFAULT 0,
        valor_parado_90d REAL DEFAULT 0,
        atualizado_em TEXT DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE IF NOT EXISTS digifarma_vendas_hoje_cache (
        venda_nota_id INTEGER PRIMARY KEY,
        data_hora TEXT NOT NULL,
        valor_total REAL NOT NULL,
        cancelado TEXT DEFAULT 'N',
        formas_pagamento TEXT,
        total_itens INTEGER DEFAULT 0,
        atualizado_em TEXT DEFAULT (datetime('now', 'localtime'))
      );
    `;
    db.exec(createDigifarmaSyncTables);
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_cred_cli ON digifarma_crediario_cache(cliente_id);'); } catch(e) {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_cred_venc ON digifarma_crediario_cache(data_vencimento);'); } catch(e) {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_vendas_data ON digifarma_vendas_hoje_cache(data_hora);'); } catch(e) {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_prod_cache_ean ON digifarma_products_cache(codigo_barras);'); } catch(e) {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_prod_cache_id ON digifarma_products_cache(produto_id);'); } catch(e) {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_prod_cache_desc ON digifarma_products_cache(descricao);'); } catch(e) {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_prod_cache_curva ON digifarma_products_cache(curva);'); } catch(e) {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_prod_cache_curva_desc ON digifarma_products_cache(curva, descricao);'); } catch(e) {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_prod_cache_estoque ON digifarma_products_cache(estoque_atual);'); } catch(e) {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_napp_ean ON napp_prices(ean);'); } catch(e) {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_napp_prod_id ON napp_prices(produto_id);'); } catch(e) {}

    try { db.exec('ALTER TABLE anvisa_alerts ADD COLUMN tem_estoque_manual INTEGER DEFAULT NULL'); } catch(e) {}
    try { db.exec("ALTER TABLE anvisa_alerts ADD COLUMN status_estoque TEXT DEFAULT 'semEstoque'"); } catch(e) {}
    try { db.exec('ALTER TABLE anvisa_alerts ADD COLUMN match_score INTEGER DEFAULT 0'); } catch(e) {}
    try { db.exec('ALTER TABLE anvisa_alerts ADD COLUMN notificado INTEGER DEFAULT 0'); } catch(e) {}

    // Inventario Module Tables
    const createSessoesInventarioTable = `
      CREATE TABLE IF NOT EXISTS sessoes_inventario (
        id TEXT PRIMARY KEY,
        data_inicio TEXT NOT NULL,
        data_fim TEXT,
        status TEXT NOT NULL
      );
    `;

    const createItensInventariadosTable = `
      CREATE TABLE IF NOT EXISTS itens_inventariados (
        id TEXT PRIMARY KEY,
        sessao_id TEXT NOT NULL,
        codigo_barras TEXT NOT NULL,
        descricao TEXT NOT NULL,
        quantidade_contada INTEGER DEFAULT 1,
        data_hora_bip TEXT NOT NULL,
        FOREIGN KEY(sessao_id) REFERENCES sessoes_inventario(id) ON DELETE CASCADE
      );
    `;

    const createVendasDuranteInventarioTable = `
      CREATE TABLE IF NOT EXISTS vendas_durante_inventario (
        id TEXT PRIMARY KEY,
        sessao_id TEXT NOT NULL,
        codigo_barras TEXT NOT NULL,
        quantidade_vendida REAL NOT NULL,
        data_hora_venda TEXT NOT NULL,
        FOREIGN KEY(sessao_id) REFERENCES sessoes_inventario(id) ON DELETE CASCADE
      );
    `;

    const createDigifarmaProductsCacheTable = `
      CREATE TABLE IF NOT EXISTS digifarma_products_cache (
        codigo_barras TEXT PRIMARY KEY,
        produto_id TEXT,
        descricao TEXT NOT NULL,
        estoque_atual REAL,
        preco_venda REAL,
        atualizado_em TEXT
      );
    `;

    const createNappPricesTable = `
      CREATE TABLE IF NOT EXISTS napp_prices (
        ean TEXT PRIMARY KEY,
        produto_id TEXT,
        preco_proffer REAL,
        preco_proffer_baixo REAL,
        preco_proffer_medio REAL,
        preco_proffer_alto REAL,
        atualizado_em TEXT
      );
    `;

    const createCardMachineReceivablesTable = `
      CREATE TABLE IF NOT EXISTS card_machine_receivables (
        id TEXT PRIMARY KEY,
        closing_id TEXT,
        sale_date TEXT NOT NULL,
        expected_payment_date TEXT NOT NULL,
        modality TEXT NOT NULL,
        brand TEXT NOT NULL DEFAULT 'Outros',
        machine_name TEXT NOT NULL DEFAULT 'M1',
        is_weekend_accumulated INTEGER DEFAULT 0,
        gross_value REAL NOT NULL,
        net_deposited_value REAL,
        fee_value REAL,
        fee_percent REAL,
        status TEXT NOT NULL DEFAULT 'Pendente',
        reconciled_at TEXT,
        reconciled_by TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
      );
    `;

    const createPricingEngineTables = `
      CREATE TABLE IF NOT EXISTS pricing_rules (
        id TEXT PRIMARY KEY,
        aliquota_impostos_pct REAL NOT NULL DEFAULT 4.0,
        despesas_operacionais_pct REAL NOT NULL DEFAULT 12.0,
        taxa_cartao_pct REAL NOT NULL DEFAULT 2.5,
        margem_minima_absoluta_pct REAL NOT NULL DEFAULT 5.0,
        max_variacao_alerta_pct REAL NOT NULL DEFAULT 20.0,
        dias_analise_abc INTEGER NOT NULL DEFAULT 60,
        matriz_margens_json TEXT NOT NULL,
        atualizado_em TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pricing_suggestions (
        ean TEXT PRIMARY KEY,
        produto_id TEXT NOT NULL,
        descricao TEXT NOT NULL,
        categoria TEXT NOT NULL,
        curva TEXT NOT NULL DEFAULT 'C',
        estoque_atual REAL DEFAULT 0,
        custo_liquido REAL NOT NULL,
        preco_atual REAL NOT NULL,
        preco_sugerido REAL NOT NULL,
        preco_pmc REAL DEFAULT 0,
        preco_proffer REAL,
        preco_proffer_baixo REAL,
        preco_proffer_medio REAL,
        preco_proffer_alto REAL,
        margem_atual_pct REAL,
        margem_projetada_pct REAL,
        variacao_pct REAL,
        variacao_valor REAL,
        trava_teto_cmed INTEGER DEFAULT 0,
        trava_piso_minimo INTEGER DEFAULT 0,
        trava_volatilidade INTEGER DEFAULT 0,
        requer_aprovacao_manual INTEGER DEFAULT 0,
        justificativa TEXT,
        calculado_em TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pricing_runs (
        id TEXT PRIMARY KEY,
        executado_em TEXT NOT NULL,
        total_skus INTEGER DEFAULT 0,
        total_sugestoes INTEGER DEFAULT 0,
        total_travas INTEGER DEFAULT 0,
        total_aprovacao_necessaria INTEGER DEFAULT 0,
        margem_media_atual REAL DEFAULT 0,
        margem_media_projetada REAL DEFAULT 0,
        duracao_ms INTEGER DEFAULT 0
      );
    `;

    db.exec(createSessoesInventarioTable);
    db.exec(createItensInventariadosTable);
    db.exec(createVendasDuranteInventarioTable);
    db.exec(createDigifarmaProductsCacheTable);
    db.exec(createNappPricesTable);
    db.exec(createCardMachineReceivablesTable);
    db.exec(createPricingEngineTables);

    try { db.exec('ALTER TABLE napp_prices ADD COLUMN preco_proffer_baixo REAL'); } catch(e) {}
    try { db.exec('ALTER TABLE napp_prices ADD COLUMN preco_proffer_medio REAL'); } catch(e) {}
    try { db.exec('ALTER TABLE napp_prices ADD COLUMN preco_proffer_alto REAL'); } catch(e) {}
    try { db.exec('UPDATE napp_prices SET preco_proffer_medio = preco_proffer, preco_proffer_baixo = preco_proffer, preco_proffer_alto = preco_proffer WHERE preco_proffer_medio IS NULL AND preco_proffer IS NOT NULL'); } catch(e) {}

    try { db.exec('ALTER TABLE pricing_suggestions ADD COLUMN preco_proffer_baixo REAL'); } catch(e) {}
    try { db.exec('ALTER TABLE pricing_suggestions ADD COLUMN preco_proffer_medio REAL'); } catch(e) {}
    try { db.exec('ALTER TABLE pricing_suggestions ADD COLUMN preco_proffer_alto REAL'); } catch(e) {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_ps_curva_aprov_desc ON pricing_suggestions(curva, requer_aprovacao_manual, descricao);'); } catch(e) {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_ps_categoria ON pricing_suggestions(categoria);'); } catch(e) {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_ps_variacao ON pricing_suggestions(variacao_valor);'); } catch(e) {}

    try { db.exec('ALTER TABLE digifarma_products_cache ADD COLUMN tributacao_monofasica TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE digifarma_products_cache ADD COLUMN cst_pis TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE digifarma_products_cache ADD COLUMN cst_cofins TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE digifarma_products_cache ADD COLUMN aliquota_st REAL'); } catch(e) {}
    try { db.exec('ALTER TABLE digifarma_products_cache ADD COLUMN imposto_aliq REAL'); } catch(e) {}
    try { db.exec('ALTER TABLE digifarma_products_cache ADD COLUMN ncm TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE digifarma_products_cache ADD COLUMN cest TEXT'); } catch(e) {}

    // Inserir regras padrão de precificação se não existirem
    try {
      const existingRules = db.prepare('SELECT id FROM pricing_rules WHERE id = ?').get('default');
      if (!existingRules) {
        const defaultMatriz = {
          referencia: { A: 14.0, B: 20.0, C: 25.0 },
          generico: { A: 42.0, B: 52.0, C: 62.0 },
          similar: { A: 45.0, B: 58.0, C: 68.0 },
          mips: { A: 25.0, B: 32.0, C: 42.0 },
          perfumaria: { A: 28.0, B: 38.0, C: 48.0 },
          outros: { A: 22.0, B: 30.0, C: 40.0 }
        };
        db.prepare(`
          INSERT INTO pricing_rules (
            id, aliquota_impostos_pct, despesas_operacionais_pct, taxa_cartao_pct,
            margem_minima_absoluta_pct, max_variacao_alerta_pct, dias_analise_abc,
            matriz_margens_json, atualizado_em
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          'default',
          4.0,   // 4% impostos (PIS/COFINS monofásico e ICMS-ST médio farmácia simples/presumido)
          12.0,  // 12% despesas operacionais médias
          2.5,   // 2.5% taxa média de cartão
          5.0,   // 5% margem mínima absoluta de piso
          20.0,  // 20% variação máxima antes de sinalizar alerta
          60,    // 60 dias para Curva ABC
          JSON.stringify(defaultMatriz),
          new Date().toISOString()
        );
        console.log('✅ Regras padrão de precificação inseridas em pricing_rules.');
      }
    } catch (errRules) {
      console.warn('Erro ao inicializar pricing_rules:', errRules.message);
    }

    // --- Price Manager Table Migrations ---
    try {
      db.prepare('SELECT categoria_id FROM digifarma_products_cache LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE digifarma_products_cache ADD COLUMN categoria_id INTEGER DEFAULT 0');
      console.log('Added categoria_id column to digifarma_products_cache table.');
    }

    try {
      db.prepare('SELECT curva FROM digifarma_products_cache LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE digifarma_products_cache ADD COLUMN curva TEXT DEFAULT "C"');
      console.log('Added curva column to digifarma_products_cache table.');
    }

    try {
      db.prepare('SELECT jobRole FROM users LIMIT 1').get();
    } catch (e) {
      try {
        db.exec('ALTER TABLE users ADD COLUMN jobRole TEXT DEFAULT "Outro"');
        console.log('Added jobRole column to users table.');
      } catch (err) {}
    }

    try {
      db.prepare('SELECT phone FROM users LIMIT 1').get();
    } catch (e) {
      try {
        db.exec('ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ""');
        console.log('Added phone column to users table.');
      } catch (err) {}
    }

    try {
      const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
      if (!userCount || userCount.count === 0) {
        console.log('[Database] Populando banco com usuários padrão...');
        const insertUser = db.prepare('INSERT INTO users (id, name, role, jobRole, accessKey) VALUES (?, ?, ?, ?, ?)');
        insertUser.run('usr-master', 'Administrador Bela', 'Administrador', 'Gerente', 'belafarma2024');
        insertUser.run('usr-admin', 'Administrador', 'Administrador', 'Gerente', 'admin');
        insertUser.run('usr-edevaldo', 'Edevaldo', 'Administrador', 'Gerente', '2494');
        insertUser.run('usr-nayane', 'Nayane', 'Operador', 'Comprador(a)', '1234');
        insertUser.run('usr-balcao', 'Balcão', 'Operador', 'Operador(a) de Caixa', '5678');
      }
    } catch (e) {
      console.error('Erro ao popular usuários iniciais:', e.message);
    }

    try {
      db.prepare('SELECT preco_custo FROM digifarma_products_cache LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE digifarma_products_cache ADD COLUMN preco_custo REAL DEFAULT 0.0');
      console.log('Added preco_custo column to digifarma_products_cache table.');
    }

    try {
      db.prepare('SELECT preco_promocao FROM digifarma_products_cache LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE digifarma_products_cache ADD COLUMN preco_promocao REAL DEFAULT 0.0');
      console.log('Added preco_promocao column to digifarma_products_cache table.');
    }

    try {
      db.prepare('SELECT preco_normal FROM digifarma_products_cache LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE digifarma_products_cache ADD COLUMN preco_normal REAL DEFAULT 0.0');
      console.log('Added preco_normal column to digifarma_products_cache table.');
    }

    try {
      db.prepare('SELECT categoria_id FROM digifarma_products_cache LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE digifarma_products_cache ADD COLUMN categoria_id INTEGER DEFAULT 0');
      console.log('Added categoria_id column to digifarma_products_cache table.');
    }




    // Create indexes for fast lookups
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_stock_products_name ON stock_products(name);');
      db.exec('CREATE INDEX IF NOT EXISTS idx_label_print_queue_status ON label_print_queue(status);');
      db.exec('CREATE INDEX IF NOT EXISTS idx_digifarma_cache_desc ON digifarma_products_cache(descricao);');
      console.log('Stock, Label and Digifarma Cache indexes verified/created.');
    } catch (e) {
      console.log('Stock/Label/Cache indexes already exist or failed to create:', e.message);
    }

    // --- Inventario Table Migrations ---
    try {
      db.prepare('SELECT modo_teste FROM sessoes_inventario LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE sessoes_inventario ADD COLUMN modo_teste INTEGER DEFAULT 0');
      console.log('Added modo_teste column to sessoes_inventario table.');
    }

    // --- Boletos Table Migrations ---
    // Add supplierName column if it doesn't exist
    try {
      db.prepare('SELECT supplierName FROM boletos LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE boletos ADD COLUMN supplierName TEXT');
      console.log('Added supplierName column to boletos table.');
    }

    // Make order_id nullable if it's currently NOT NULL
    const boletosInfo = db.prepare('PRAGMA table_info(boletos)').all();
    const orderIdColumn = boletosInfo.find(col => col.name === 'order_id');

    // If order_id exists and is NOT NULL
    if (orderIdColumn && orderIdColumn.notnull === 1) {
      console.log('Migrating boletos table: making order_id nullable...');
      db.transaction(() => {
        // 1. Rename existing table
        db.exec('ALTER TABLE boletos RENAME TO boletos_old;');

        // 2. Create new table with desired schema (order_id TEXT)
        db.exec(`
          CREATE TABLE IF NOT EXISTS boletos (
            id TEXT PRIMARY KEY,
            supplierName TEXT,
            order_id TEXT, -- Now nullable
            due_date TEXT NOT NULL,
            value REAL NOT NULL,
            status TEXT NOT NULL,
            installment_number INTEGER,
            invoice_number TEXT
            -- FOREIGN KEY (order_id) REFERENCES orders(id) -- Foreign key constraint removed for nullable order_id
          );
        `);

        // 3. Copy data from old table to new table
        // We handle missing supplierName column in old table gracefully
        db.exec(`
          INSERT INTO boletos (id, supplierName, order_id, due_date, value, status, installment_number, invoice_number)
          SELECT 
            id, 
            COALESCE(supplierName, NULL) AS supplierName, -- Handle potential missing supplierName in old table
            order_id, 
            due_date, 
            value, 
            status, 
            installment_number, 
            invoice_number 
          FROM boletos_old;
        `);

        // 4. Drop old table
        db.exec('DROP TABLE boletos_old;');
      })();
      console.log('Boletos table migration for order_id nullable completed.');
    }
    // --- End Boletos Table Migrations ---
    // db.exec(createMonthlyLimitsTable); // Already executed
    // db.exec(createDailyRecordsTable); // Already executed

    // Add supplierName column to boletos table if it doesn't exist
    try {
      db.prepare('SELECT supplierName FROM boletos LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE boletos ADD COLUMN supplierName TEXT');
    }

    // Add boletoPath column to orders table if it doesn't exist
    try {
      db.prepare('SELECT boletoPath FROM orders LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE orders ADD COLUMN boletoPath TEXT');
    }

    // Add isFogueteAmarelo column to orders table if it doesn't exist
    try {
      db.prepare('SELECT isFogueteAmarelo FROM orders LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE orders ADD COLUMN isFogueteAmarelo INTEGER DEFAULT 0');
      console.log('Added isFogueteAmarelo column to orders table.');
    }



    // ALTER TABLE statements for new task columns (if they don't exist)
    // Recurrence
    try { db.prepare('SELECT recurrenceType FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN recurrenceType TEXT DEFAULT 'none'"); }
    try { db.prepare('SELECT recurrenceInterval FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN recurrenceInterval INTEGER DEFAULT 0"); }
    try { db.prepare('SELECT recurrenceDaysOfWeek FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN recurrenceDaysOfWeek TEXT DEFAULT '[]'"); }
    try { db.prepare('SELECT recurrenceDayOfMonth FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN recurrenceDayOfMonth INTEGER DEFAULT 0"); }
    try { db.prepare('SELECT recurrenceMonthOfYear FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN recurrenceMonthOfYear INTEGER DEFAULT 0"); }
    try { db.prepare('SELECT recurrenceEndDate FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN recurrenceEndDate TEXT"); }
    try { db.prepare('SELECT recurrenceId FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN recurrenceId TEXT"); }
    try { db.prepare('SELECT originalDueDate FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN originalDueDate TEXT"); }
    // Annotations & Admin Attention
    try { db.prepare('SELECT annotations FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN annotations TEXT DEFAULT '[]'"); }
    try { db.prepare('SELECT needsAdminAttention FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN needsAdminAttention INTEGER DEFAULT 0"); }
    try { db.prepare('SELECT adminAttentionMessage FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN adminAttentionMessage TEXT"); }
    try { db.prepare('SELECT adminResolutionMessage FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN adminResolutionMessage TEXT"); }
    try { db.prepare('SELECT hasAdminResponse FROM tasks LIMIT 1').get(); } catch (e) { db.exec("ALTER TABLE tasks ADD COLUMN hasAdminResponse INTEGER DEFAULT 0"); }
    
    // Daily records cashClosingId migration
    try {
      db.prepare('SELECT cashClosingId FROM daily_records LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE daily_records ADD COLUMN cashClosingId TEXT');
      console.log('Added cashClosingId column to daily_records table.');
    }

    // Daily records lancado migration
    try {
      db.prepare('SELECT lancado FROM daily_records LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE daily_records ADD COLUMN lancado INTEGER DEFAULT 0');
      console.log('Added lancado column to daily_records table.');
    }

    // Cash closings creditReceipts migration
    try {
      db.prepare('SELECT creditReceipts FROM cash_closings LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE cash_closings ADD COLUMN creditReceipts TEXT');
      console.log('Added creditReceipts column to cash_closings table.');
    }

    // Daily records creditReceipts migration
    try {
      db.prepare('SELECT creditReceipts FROM daily_records LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE daily_records ADD COLUMN creditReceipts TEXT');
      console.log('Added creditReceipts column to daily_records table.');
    }

    // Daily records sangrias migration
    try {
      db.prepare('SELECT sangrias FROM daily_records LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE daily_records ADD COLUMN sangrias TEXT');
      console.log('Added sangrias column to daily_records table.');
    }

    // Migrate existing data: mark all records from previous days as lancado = 1
    // (assuming records from past days were already processed in previous cash closings)
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      const updateStmt = db.prepare(`
        UPDATE daily_records 
        SET lancado = 1 
        WHERE date < ? AND lancado = 0
      `);
      const result = updateStmt.run(today);
      if (result.changes > 0) {
        console.log(`Migrated ${result.changes} old records (before ${today}) to lancado = 1`);
      }
    } catch (e) {
      console.error('Error migrating old records:', e);
    }

    // CRM: Add creditLimit column to customers table if it doesn't exist
    try {
      db.prepare('SELECT creditLimit FROM customers LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE customers ADD COLUMN creditLimit REAL DEFAULT 0');
      console.log('Added creditLimit column to customers table.');
    }

    // CRM: Add dueDay column to customers table if it doesn't exist
    try {
      db.prepare('SELECT dueDay FROM customers LIMIT 1').get();
    } catch (e) {
      // Default dueDay to current day or null? Null is better.
      db.exec('ALTER TABLE customers ADD COLUMN dueDay INTEGER');
      console.log('Added dueDay column to customers table.');
    }

    // CRM: Add preferences column to customers table if it doesn't exist
    try {
      db.prepare('SELECT preferences FROM customers LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE customers ADD COLUMN preferences TEXT');
      console.log('Added preferences column to customers table.');
    }

    // Create bugs table for system bug tracking
    db.exec(`
      CREATE TABLE IF NOT EXISTS bugs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        reporter TEXT NOT NULL,
        priority TEXT NOT NULL,
        status TEXT NOT NULL,
        category TEXT,
        createdAt TEXT NOT NULL,
        resolvedAt TEXT,
        resolvedBy TEXT,
        resolutionNotes TEXT,
        screenshots TEXT
      )
    `);
    console.log('Bugs table verified/created.');

    // Create flyering_tasks table for panfletagem management
    db.exec(`
      CREATE TABLE IF NOT EXISTS flyering_tasks (\n        id TEXT PRIMARY KEY,
        type TEXT NOT NULL, -- 'polyline' or 'polygon'
        coordinates TEXT NOT NULL, -- JSON array de [lat, lng]
        assignedUserId TEXT NOT NULL,
        status TEXT NOT NULL, -- 'Pendente', 'Em Andamento', 'Concluído'
        color TEXT NOT NULL, -- Cor hexadecimal
        createdAt TEXT NOT NULL,
        createdBy TEXT NOT NULL,
        description TEXT,
        area TEXT -- Nome da área
      )
    `);
    console.log('Flyering tasks table verified/created.');

    // ========================================================================
    // SISTEMA FOGUETE AMARELO - Tabelas para gestão de notas fiscais
    // ========================================================================

    // Tabela: invoices (Notas Fiscais de Entrada)
    db.exec(`
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        invoice_number TEXT NOT NULL UNIQUE,
        supplier_name TEXT NOT NULL,
        issue_date TEXT NOT NULL,
        total_value REAL NOT NULL,
        is_foguete_amarelo INTEGER DEFAULT 0,
        payment_due_date TEXT,
        status TEXT DEFAULT 'Ativa',
        created_at TEXT NOT NULL,
        created_by TEXT NOT NULL,
        notes TEXT
      )
    `);
    console.log('Invoices table verified/created.');

    // Índices para invoices
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_invoices_supplier ON invoices(supplier_name)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_invoices_foguete ON invoices(is_foguete_amarelo, status)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(payment_due_date)');
    } catch (e) {
      console.log('Invoices indexes already exist.');
    }

    // Tabela: invoice_items (Itens da Nota Fiscal)
    db.exec(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL,
        product_code TEXT NOT NULL,
        product_name TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_cost REAL NOT NULL,
        total_cost REAL NOT NULL,
        quantity_sold REAL DEFAULT 0,
        quantity_remaining REAL NOT NULL,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
      )
    `);
    console.log('Invoice items table verified/created.');

    // Índices para invoice_items
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON invoice_items(product_code)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_invoice_items_remaining ON invoice_items(quantity_remaining)');
    } catch (e) {
      console.log('Invoice items indexes already exist.');
    }

    // Tabela: sales (Vendas - PDV)
    db.exec(`
      CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        sale_date TEXT NOT NULL,
        sale_time TEXT NOT NULL,
        total_value REAL NOT NULL,
        payment_method TEXT NOT NULL,
        customer_id TEXT,
        user_id TEXT NOT NULL,
        status TEXT DEFAULT 'Finalizada',
        created_at TEXT NOT NULL,
        cancelled_at TEXT,
        cancellation_reason TEXT,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      )
    `);
    console.log('Sales table verified/created.');

    // Índices para sales
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_sales_user ON sales(user_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status)');
    } catch (e) {
      console.log('Sales indexes already exist.');
    }

    // Tabela: sale_items (Itens da Venda)
    db.exec(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL,
        product_code TEXT NOT NULL,
        product_name TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        total_price REAL NOT NULL,
        unit_cost REAL NOT NULL,
        total_cost REAL NOT NULL,
        profit REAL NOT NULL,
        invoice_item_id TEXT,
        is_foguete_amarelo INTEGER DEFAULT 0,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
        FOREIGN KEY (invoice_item_id) REFERENCES invoice_items(id)
      )
    `);
    console.log('Sale items table verified/created.');

    // Índices para sale_items
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_code)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_sale_items_foguete ON sale_items(is_foguete_amarelo)');
    } catch (e) {
      console.log('Sale items indexes already exist.');
    }

    // Tabela: foguete_amarelo_payments (Pagamentos Antecipados)
    db.exec(`
      CREATE TABLE IF NOT EXISTS foguete_amarelo_payments (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL,
        invoice_number TEXT NOT NULL,
        sale_id TEXT,
        payment_date TEXT NOT NULL,
        value REAL NOT NULL,
        status TEXT DEFAULT 'Pendente',
        created_at TEXT NOT NULL,
        notes TEXT,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
      )
    `);
    console.log('Foguete Amarelo payments table verified/created.');

    // Índices para foguete_amarelo_payments
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_fap_invoice ON foguete_amarelo_payments(invoice_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_fap_payment_date ON foguete_amarelo_payments(payment_date)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_fap_status ON foguete_amarelo_payments(status)');
    } catch (e) {
      console.log('Foguete Amarelo payments indexes already exist.');
    }

    // Adicionar colunas que podem estar faltando
    try {
      db.exec('ALTER TABLE foguete_amarelo_payments ADD COLUMN observations TEXT');
      console.log('Coluna observations adicionada.');
    } catch (e) {
      // Coluna já existe
    }

    try {
      db.exec('ALTER TABLE foguete_amarelo_payments ADD COLUMN created_by TEXT');
      console.log('Coluna created_by adicionada.');
    } catch (e) {
      // Coluna já existe
    }

    // Tabela: accounts_payable (Contas a Pagar Unificada)
    db.exec(`
      CREATE TABLE IF NOT EXISTS accounts_payable (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        reference_id TEXT,
        supplier_name TEXT NOT NULL,
        description TEXT,
        due_date TEXT NOT NULL,
        original_value REAL NOT NULL,
        amortized_value REAL DEFAULT 0,
        remaining_value REAL NOT NULL,
        status TEXT DEFAULT 'Pendente',
        is_foguete_amarelo INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        paid_at TEXT,
        payment_method TEXT,
        notes TEXT
      )
    `);
    console.log('Accounts payable table verified/created.');

    // Índices para accounts_payable
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_ap_type ON accounts_payable(type)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_ap_due_date ON accounts_payable(due_date)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_ap_status ON accounts_payable(status)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_ap_foguete ON accounts_payable(is_foguete_amarelo)');
    } catch (e) {
      console.log('Accounts payable indexes already exist.');
    }

    // Garantir colunas em safe_entries (Correção de Bug Cofre)
    try {
      db.exec('ALTER TABLE safe_entries ADD COLUMN userName TEXT');
      console.log('Coluna userName adicionada em safe_entries.');
    } catch (e) {}

    try {
      db.exec('ALTER TABLE safe_entries ADD COLUMN source_id TEXT');
      console.log('Coluna source_id adicionada em safe_entries.');
    } catch (e) {}

    try {
      db.exec('ALTER TABLE safe_entries ADD COLUMN parent_id TEXT');
      console.log('Coluna parent_id adicionada em safe_entries.');
    } catch (e) {}

    // ========================================================================
    // MÓDULO iFOOD - Tabela para gestão de vendas iFood
    // ========================================================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS ifood_sales (
        id TEXT PRIMARY KEY,
        sale_date TEXT NOT NULL,
        gross_value REAL NOT NULL,
        operator_fee_percent REAL DEFAULT 0,
        operator_fee_value REAL DEFAULT 0,
        net_value REAL NOT NULL,
        payment_due_date TEXT NOT NULL,
        status TEXT DEFAULT 'Pendente',
        received_at TEXT,
        description TEXT,
        daily_record_id TEXT,
        checking_account_id TEXT,
        user_name TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    console.log('iFood sales table verified/created.');

    // Índices para ifood_sales
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_ifood_sale_date ON ifood_sales(sale_date)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_ifood_status ON ifood_sales(status)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_ifood_due_date ON ifood_sales(payment_due_date)');
    } catch (e) {
      console.log('iFood sales indexes already exist.');
    }

    console.log('✅ Módulo iFood: Tabela criada com sucesso!');

    // Tabela de configurações do sistema (chave-valor)
    db.exec(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT
      )
    `);
    console.log('System settings table verified/created.');

    // Inserir valor padrão para taxa iFood se não existir
    const existingFee = db.prepare("SELECT * FROM system_settings WHERE key = 'ifood_fee_percent'").get();
    if (!existingFee) {
      db.prepare("INSERT INTO system_settings (key, value, updated_at) VALUES ('ifood_fee_percent', '6.5', ?)").run(new Date().toISOString());
      console.log('Default iFood fee (6.5%) inserted.');
    }

    console.log('✅ Sistema Foguete Amarelo: Todas as tabelas criadas com sucesso!');

    // ========================================================================
    // SISTEMA DE MENSAGENS WHATSAPP - Tabelas
    // ========================================================================

    // CRM: Add birthDate column to customers table if it doesn't exist
    try {
      db.prepare('SELECT birthDate FROM customers LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE customers ADD COLUMN birthDate TEXT');
      console.log('Added birthDate column to customers table.');
    }

    // Tabela: message_templates (Templates editáveis de mensagens)
    db.exec(`
      CREATE TABLE IF NOT EXISTS message_templates (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        isActive INTEGER DEFAULT 1,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `);
    console.log('Message templates table verified/created.');

    // Tabela: message_log (Histórico de mensagens enviadas)
    db.exec(`
      CREATE TABLE IF NOT EXISTS message_log (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        customerName TEXT,
        customerId TEXT,
        campaignId TEXT,
        errorMessage TEXT,
        sentAt TEXT NOT NULL
      )
    `);
    console.log('Message log table verified/created.');

    // Índices para message_log
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_msg_log_type ON message_log(type)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_msg_log_status ON message_log(status)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_msg_log_sentAt ON message_log(sentAt)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_msg_log_campaign ON message_log(campaignId)');
    } catch (e) {
      console.log('Message log indexes already exist.');
    }

    // Tabela: message_campaigns (Campanhas de promoção)
    db.exec(`
      CREATE TABLE IF NOT EXISTS message_campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        messageContent TEXT NOT NULL,
        targetCustomerIds TEXT,
        status TEXT DEFAULT 'rascunho',
        sentCount INTEGER DEFAULT 0,
        failedCount INTEGER DEFAULT 0,
        totalCount INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL,
        executedAt TEXT
      )
    `);
    console.log('Message campaigns table verified/created.');

    // Tabela: whatsapp_group_posts (Agendamento de postagens em grupos e status)
    db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_group_posts (
        id TEXT PRIMARY KEY,
        groupId TEXT,
        groupName TEXT,
        content TEXT NOT NULL,
        mediaPath TEXT,
        scheduledAt TEXT NOT NULL,
        status TEXT DEFAULT 'Pendente',
        errorMessage TEXT,
        createdAt TEXT NOT NULL,
        sentAt TEXT,
        type TEXT DEFAULT 'group'
      )
    `);
    try {
      db.exec(`ALTER TABLE whatsapp_group_posts ADD COLUMN type TEXT DEFAULT 'group'`);
    } catch (e) {
      // Coluna já existe
    }
    console.log('WhatsApp group posts table verified/created.');

    // Tabela: whatsapp_offers_bank (Banco de imagens/textos de ofertas)
    db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_offers_bank (
        id TEXT PRIMARY KEY,
        productName TEXT NOT NULL,
        price REAL NOT NULL,
        category TEXT NOT NULL,
        mediaPath TEXT,
        aiCaption TEXT,
        createdAt TEXT NOT NULL
      )
    `);
    console.log('WhatsApp offers bank table verified/created.');

    // Tabela: whatsapp_custom_groups (Grupos de WhatsApp customizados salvos pelo usuário)
    db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_custom_groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);
    console.log('WhatsApp custom groups table verified/created.');

    console.log('✅ Sistema de Mensagens: Tabelas criadas com sucesso!');

    // ========================================================================
    // AGENTE DE MARKETING - Tabela para relatórios gerados pela IA
    // ========================================================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS marketing_reports (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        metadata TEXT,
        sentToRosana INTEGER DEFAULT 0,
        sentAt TEXT,
        createdAt TEXT NOT NULL
      )
    `);

    // Índice para busca por data
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_mkt_reports_created ON marketing_reports(createdAt)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_mkt_reports_sent ON marketing_reports(sentToRosana)');
    } catch (e) { /* índices já existem */ }

    console.log('✅ Agente de Marketing: Tabela marketing_reports criada!');

    // Histórico de produtos sugeridos para evitar repetição
    db.exec(`
      CREATE TABLE IF NOT EXISTS marketing_suggestions_history (
        id TEXT PRIMARY KEY,
        productName TEXT NOT NULL,
        suggestedAction TEXT,
        suggestedAt TEXT NOT NULL,
        approved INTEGER DEFAULT 0,
        taskId TEXT
      )
    `);

    // Controle de aprovações pendentes (Nayane enviando "ok")
    db.exec(`
      CREATE TABLE IF NOT EXISTS nayane_pending_approvals (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        suggestionsJson TEXT NOT NULL,
        status TEXT DEFAULT 'Pendente',
        createdAt TEXT NOT NULL
      )
    `);

    console.log('✅ Agente de Marketing: Tabelas de histórico e aprovações criadas!');

    // ========================================================================
    // CRM WHATSAPP — Histórico de Produtos por Cliente
    // ========================================================================
    db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_product_history (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        customer_id TEXT,
        product_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('comprado', 'pesquisado', 'nao_encontrado', 'cancelado')),
        interaction_date TEXT,
        source TEXT DEFAULT 'WhatsApp',
        notes TEXT,
        created_at TEXT NOT NULL
      )
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_wph_phone ON whatsapp_product_history(phone)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_wph_status ON whatsapp_product_history(status)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_wph_product ON whatsapp_product_history(product_name)');
    } catch (e) { /* índices já existem */ }
    console.log('✅ CRM WhatsApp: Tabela whatsapp_product_history criada!');

    // Cache de auditorias de clientes inativos (usado no módulo de marketing)
    db.exec(`
      CREATE TABLE IF NOT EXISTS crm_inactive_audits (
        phone TEXT PRIMARY KEY,
        whatsappName TEXT,
        systemName TEXT,
        jid TEXT,
        inactivityDays INTEGER,
        lastMessage TEXT,
        lastInteractionTime INTEGER,
        atendido INTEGER DEFAULT 0,
        fechouVenda INTEGER DEFAULT 0,
        modalidade TEXT,
        modalidadeDescricao TEXT,
        endereco TEXT,
        ideiaReativacao TEXT,
        productsJson TEXT DEFAULT '[]',
        auditedAt TEXT
      )
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_cia_phone ON crm_inactive_audits(phone)');
    } catch (e) { /* índice já existe */ }
    console.log('✅ CRM WhatsApp: Tabela crm_inactive_audits criada!');

    // Tabela para armazenar o histórico local das mensagens de WhatsApp para análise de faltas e PIX
    db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        fromMe INTEGER NOT NULL,
        messageText TEXT NOT NULL,
        rawMessage TEXT,
        timestamp INTEGER NOT NULL
      )
    `);
    try {
      db.exec('ALTER TABLE whatsapp_messages ADD COLUMN rawMessage TEXT');
    } catch (e) { /* Coluna já existe */ }
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_wm_phone ON whatsapp_messages(phone)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_wm_timestamp ON whatsapp_messages(timestamp)');
    } catch (e) { /* índices já existem */ }
    console.log('✅ CRM WhatsApp: Tabela whatsapp_messages atualizada com rawMessage!');

    // Tabela para armazenar os pedidos de entrega (Deliveries) e orçamentos não fechados identificados via IA
    db.exec(`
      -- Evolution API WhatsApp Contacts Cache
      CREATE TABLE IF NOT EXISTS whatsapp_contacts (
        id TEXT PRIMARY KEY,
        name TEXT,
        pushName TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS deliveries (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        customer_name TEXT,
        delivery_address TEXT,
        items TEXT,
        total_amount REAL DEFAULT 0,
        payment_method TEXT,
        status TEXT DEFAULT 'Pendente',
        sale_closed INTEGER DEFAULT 1,
        unclosed_reason TEXT,
        last_message_id TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    try {
      db.exec('ALTER TABLE deliveries ADD COLUMN sale_closed INTEGER DEFAULT 1');
    } catch (e) { /* coluna já existe */ }
    try {
      db.exec('ALTER TABLE deliveries ADD COLUMN unclosed_reason TEXT');
    } catch (e) { /* coluna já existe */ }
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_deliveries_phone ON deliveries(phone)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_deliveries_closed ON deliveries(sale_closed)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_deliveries_created ON deliveries(created_at)');
    } catch (e) { /* índices já existem */ }
    console.log('✅ Tabela deliveries atualizada para suportar auditoria de Vendas Fechadas x Não Fechadas!');

    // M1: Migration - Colunas de auditoria e revisão interativa em deliveries
    try { db.exec('ALTER TABLE deliveries ADD COLUMN review_status TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE deliveries ADD COLUMN classification_type TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE deliveries ADD COLUMN is_new_customer INTEGER DEFAULT 0'); } catch(e) {}
    try { db.exec('ALTER TABLE deliveries ADD COLUMN chat_duration_seconds INTEGER DEFAULT 0'); } catch(e) {}
    try { db.exec('ALTER TABLE deliveries ADD COLUMN chat_message_count INTEGER DEFAULT 0'); } catch(e) {}
    try { db.exec('ALTER TABLE deliveries ADD COLUMN discussed_products_json TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE deliveries ADD COLUMN rejection_details_json TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE deliveries ADD COLUMN reviewed_by TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE deliveries ADD COLUMN reviewed_at DATETIME'); } catch(e) {}
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_deliveries_review_status ON deliveries(review_status)');
    } catch(e) {}

    // M1: Criar tabela chat_product_rejections para métricas de rejeição de produtos
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_product_rejections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        delivery_id INTEGER,
        phone TEXT,
        product_name TEXT,
        reason TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_cpr_delivery ON chat_product_rejections(delivery_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_cpr_phone ON chat_product_rejections(phone)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_cpr_reason ON chat_product_rejections(reason)');
    } catch (e) {}
    console.log('✅ Tabela chat_product_rejections e colunas de auditoria em deliveries verificadas/criadas!');

    // Migration: adicionar coluna source em customers (usada no webhook)
    try {
      db.prepare('SELECT source FROM customers LIMIT 1').get();
    } catch (e) {
      db.exec("ALTER TABLE customers ADD COLUMN source TEXT DEFAULT 'Manual'");
      console.log('✅ Migration: coluna source adicionada em customers.');
    }

    // Migration: adicionar coluna source em shortages (para identificar origem WhatsApp)
    try {
      db.prepare('SELECT source FROM shortages LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE shortages ADD COLUMN source TEXT');
      console.log('✅ Migration: coluna source adicionada em shortages.');
    }

    // Migration: adicionar coluna purchased em shortages
    try {
      db.prepare('SELECT purchased FROM shortages LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE shortages ADD COLUMN purchased INTEGER DEFAULT 0');
      console.log('✅ Migration: coluna purchased adicionada em shortages.');
    }

    // Migration: adicionar coluna ordered em shortages
    try {
      db.prepare('SELECT ordered FROM shortages LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE shortages ADD COLUMN ordered INTEGER DEFAULT 0');
      console.log('✅ Migration: coluna ordered adicionada em shortages.');
    }

    // Migration: adicionar coluna whatsapp_name em customers
    try {
      db.prepare('SELECT whatsapp_name FROM customers LIMIT 1').get();
    } catch (e) {
      db.exec('ALTER TABLE customers ADD COLUMN whatsapp_name TEXT');
      console.log('✅ Migration: coluna whatsapp_name adicionada em customers.');
    }

    // Migration: Limpeza de LIDs/Grupos inválidos em customers
    try {
      db.exec("DELETE FROM customers WHERE phone LIKE '120363%' OR LENGTH(phone) > 15 OR phone LIKE '%@g.us%' OR phone LIKE '%@lid%'");
      console.log('✅ Migration: Limpeza de LIDs/Grupos em customers concluída!');
    } catch (e) {}

    // Migration: adicionar colunas de CRM Preditivo (Uso Contínuo e Cruzamento de Faltas) em whatsapp_product_history
    try {
      db.prepare('SELECT is_continuous_use FROM whatsapp_product_history LIMIT 1').get();
    } catch (e) {
      try {
        db.exec('ALTER TABLE whatsapp_product_history ADD COLUMN is_continuous_use INTEGER DEFAULT 0');
        db.exec('ALTER TABLE whatsapp_product_history ADD COLUMN treatment_duration_days INTEGER DEFAULT 30');
        db.exec('ALTER TABLE whatsapp_product_history ADD COLUMN last_purchase_date TEXT');
        db.exec('ALTER TABLE whatsapp_product_history ADD COLUMN next_reminder_date TEXT');
        db.exec("ALTER TABLE whatsapp_product_history ADD COLUMN reminder_status TEXT DEFAULT 'pendente'");
        db.exec('ALTER TABLE whatsapp_product_history ADD COLUMN notified_arrival INTEGER DEFAULT 0');
        console.log('✅ Migration: Colunas de CRM Preditivo adicionadas a whatsapp_product_history.');
      } catch (alterErr) {
        console.error('❌ Erro ao adicionar colunas de CRM Preditivo:', alterErr.message);
      }
    }

    // Migration: adicionar colunas type e userName em pix_confirmations (extrato Pix)
    try { db.exec('ALTER TABLE pix_confirmations ADD COLUMN type TEXT DEFAULT "entrada"'); } catch(e) {}
    try { db.exec('ALTER TABLE pix_confirmations ADD COLUMN userName TEXT DEFAULT ""'); } catch(e) {}

    // Criar tabela scraped_images para o módulo WhatsApp Vendas
    db.exec(`
      CREATE TABLE IF NOT EXISTS scraped_images (
        ean TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        image_url TEXT NOT NULL,
        category TEXT,
        brand TEXT,
        last_updated TEXT
      )
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_scraped_images_ean ON scraped_images(ean)');
    } catch(e) {}
    console.log('✅ WhatsApp Vendas: Tabela scraped_images criada/verificada!');

    // Criar tabela critical_products para estoque crítico monitorado
    db.exec(`
      CREATE TABLE IF NOT EXISTS critical_products (
        id TEXT PRIMARY KEY,
        produto_id INTEGER NOT NULL UNIQUE,
        productName TEXT NOT NULL,
        minStock INTEGER DEFAULT 0
      )
    `);
    console.log('✅ Estoque Crítico: Tabela critical_products criada/verificada!');

    // Criar tabela custom_product_groups para agrupamentos customizados de produtos
    db.exec(`
      CREATE TABLE IF NOT EXISTS custom_product_groups (
        codigo_barras TEXT PRIMARY KEY,
        grupo_customizado TEXT NOT NULL,
        manual_override INTEGER DEFAULT 1
      )
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_cpg_grupo ON custom_product_groups(grupo_customizado)');
    } catch(e) {}
    console.log('✅ Grupos Customizados: Tabela custom_product_groups criada/verificada!');

    // Criar tabela page_visitors para contador de acessos do Dashboard
    db.exec(`
      CREATE TABLE IF NOT EXISTS page_visitors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        visited_at TEXT NOT NULL,
        date_str TEXT NOT NULL,
        user_name TEXT
      );
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_pv_date ON page_visitors(date_str)');
    } catch(e) {}
    console.log('✅ Contador de Visitantes: Tabela page_visitors criada/verificada!');

    // Migrations para Card Machines (Bandeiras, Fim de semana acumulado, Maquininhas M1/M2) e Fechamento (Crédito Parcelado, Grade)
    try { db.exec("ALTER TABLE card_machine_receivables ADD COLUMN brand TEXT NOT NULL DEFAULT 'Outros'"); } catch(e) {}
    try { db.exec("ALTER TABLE card_machine_receivables ADD COLUMN is_weekend_accumulated INTEGER DEFAULT 0"); } catch(e) {}
    try { db.exec("ALTER TABLE card_machine_receivables ADD COLUMN machine_name TEXT NOT NULL DEFAULT 'M1'"); } catch(e) {}
    try { db.exec("ALTER TABLE cash_closings ADD COLUMN credit_installments REAL DEFAULT 0"); } catch(e) {}
    try { db.exec("ALTER TABLE cash_closings ADD COLUMN card_grid_json TEXT"); } catch(e) {}
    console.log('✅ Maquininhas: Migrações de bandeira, máquina M1/M2, parcelado e acumulado de fim de semana verificadas!');

    // Criar tabela compras_estoque_cache para Central de Compras (Estoque Mínimo, Rupturas e Histórico Ponderado)
    db.exec(`
      CREATE TABLE IF NOT EXISTS compras_estoque_cache (
        produto_id INTEGER PRIMARY KEY,
        descricao TEXT NOT NULL,
        ean TEXT,
        categoria_id INTEGER DEFAULT 0,
        curva_abc TEXT DEFAULT 'C',
        saldo REAL DEFAULT 0,
        est_minimo_calculado REAL DEFAULT 0,
        est_maximo_calculado REAL DEFAULT 0,
        est_minimo_digifarma REAL DEFAULT 0,
        vmd_ponderado REAL DEFAULT 0,
        vendas_30d REAL DEFAULT 0,
        vendas_31_60d REAL DEFAULT 0,
        vendas_61_90d REAL DEFAULT 0,
        ciclo_vida TEXT DEFAULT 'ESTAVEL',
        custo_unitario REAL DEFAULT 0,
        ultima_compra_valor REAL DEFAULT 0,
        status_ruptura TEXT DEFAULT 'NORMAL',
        margem_seguranca_aplicada REAL DEFAULT 15.0,
        dias_sem_venda INTEGER DEFAULT 0,
        sincronizado_em TEXT,
        atualizado_em TEXT NOT NULL
      );
    `);
    try {
      db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN vendas_61_90d REAL DEFAULT 0');
    } catch (e) {}
    try {
      db.exec("ALTER TABLE compras_estoque_cache ADD COLUMN ciclo_vida TEXT DEFAULT 'ESTAVEL'");
    } catch (e) {}
    try {
      db.exec('ALTER TABLE compras_estoque_cache ADD COLUMN est_maximo_calculado REAL DEFAULT 0');
    } catch (e) {}
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_cec_status ON compras_estoque_cache(status_ruptura)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_cec_ean ON compras_estoque_cache(ean)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_cec_curva ON compras_estoque_cache(curva_abc)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_cec_ciclo ON compras_estoque_cache(ciclo_vida)');
    } catch(e) {}
    console.log('✅ Central de Compras: Tabela compras_estoque_cache criada/verificada!');

    // ──────────────────────────────────────────────────────────
    // Central de Compras: Tabelas de Representantes, Mineração, Cotações e Pedidos
    // ──────────────────────────────────────────────────────────
    
    // 1. Representantes e Fornecedores Comerciais
    db.exec(`
      CREATE TABLE IF NOT EXISTS compras_fornecedores_meta (
        id TEXT PRIMARY KEY,
        digifarma_id INTEGER UNIQUE,
        distribuidora TEXT NOT NULL,
        representante TEXT,
        telefone TEXT NOT NULL,
        prazos_pagamento TEXT,
        pedido_minimo_valor REAL DEFAULT 0,
        pedido_minimo_condicoes TEXT,
        taxa_quebra_percent REAL DEFAULT 0,
        pontualidade_score REAL DEFAULT 100,
        categorias_fornecidas TEXT,
        catalogo_produtos TEXT,
        ultima_varredura_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_cfm_telefone ON compras_fornecedores_meta(telefone)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_cfm_distribuidora ON compras_fornecedores_meta(distribuidora)');
    } catch(e) {}

    // 2. Histórico de Mensagens de Compras
    db.exec(`
      CREATE TABLE IF NOT EXISTS compras_historico_mensagens (
        id TEXT PRIMARY KEY,
        message_id TEXT UNIQUE,
        remote_jid TEXT NOT NULL,
        telefone TEXT NOT NULL,
        nome_contato TEXT,
        from_me INTEGER DEFAULT 0,
        timestamp INTEGER NOT NULL,
        data_hora TEXT NOT NULL,
        tipo_mensagem TEXT DEFAULT 'texto',
        texto_mensagem TEXT,
        midia_path TEXT,
        processado_mineracao INTEGER DEFAULT 0,
        resultado_mineracao_json TEXT,
        created_at TEXT NOT NULL
      )
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_chm_telefone ON compras_historico_mensagens(telefone)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_chm_timestamp ON compras_historico_mensagens(timestamp)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_chm_proc ON compras_historico_mensagens(processado_mineracao)');
    } catch(e) {}

    // 3. Oportunidades & Ofertas Mineradas
    db.exec(`
      CREATE TABLE IF NOT EXISTS compras_oportunidades_mineradas (
        id TEXT PRIMARY KEY,
        fornecedor_id TEXT,
        distribuidora TEXT,
        representante TEXT,
        telefone TEXT,
        mensagem_id TEXT,
        mensagem_raw TEXT,
        produto_nome TEXT NOT NULL,
        ean TEXT,
        preco_ofertado REAL NOT NULL,
        preco_ult_compra_digifarma REAL,
        percentual_desconto REAL,
        condicoes_pagamento TEXT,
        validade_oferta TEXT,
        status TEXT DEFAULT 'Disponivel',
        data_oferta TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (fornecedor_id) REFERENCES compras_fornecedores_meta(id)
      )
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_com_status ON compras_oportunidades_mineradas(status)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_com_produto ON compras_oportunidades_mineradas(produto_nome)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_com_ean ON compras_oportunidades_mineradas(ean)');
    } catch(e) {}

    try { db.exec('ALTER TABLE compras_oportunidades_mineradas ADD COLUMN ultimo_fornecedor TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE compras_oportunidades_mineradas ADD COLUMN data_ult_compra TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE compras_oportunidades_mineradas ADD COLUMN nota_fiscal_ult_compra TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE compras_oportunidades_mineradas ADD COLUMN embalagem_ult_compra TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE compras_oportunidades_mineradas ADD COLUMN preco_total_nota REAL'); } catch(e) {}

    // Cache de Últimas Compras do Digifarma (Firebird -> SQLite) para consulta ultra rápida (< 5ms)
    db.exec(`
      CREATE TABLE IF NOT EXISTS digifarma_ultimas_compras_cache (
        produto_id INTEGER PRIMARY KEY,
        ean TEXT,
        descricao TEXT,
        preco_unitario_ult_compra REAL NOT NULL,
        preco_total_nota REAL,
        quantidade REAL,
        embalagem INTEGER DEFAULT 1,
        embalagem_detalhe TEXT,
        data_compra TEXT,
        fornecedor_nome TEXT,
        numero_nota_fiscal TEXT,
        fonte TEXT DEFAULT 'NOTA_FISCAL',
        atualizado_em TEXT NOT NULL
      )
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_ducc_ean ON digifarma_ultimas_compras_cache(ean)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_ducc_descricao ON digifarma_ultimas_compras_cache(descricao)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_ducc_atualizado ON digifarma_ultimas_compras_cache(atualizado_em)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_cec_descricao ON compras_estoque_cache(descricao)');
      db.exec('DELETE FROM digifarma_ultimas_compras_cache WHERE preco_unitario_ult_compra <= 0');
    } catch(e) {}

    // 4. Sessões de Cotações Inteligentes
    db.exec(`
      CREATE TABLE IF NOT EXISTS compras_cotacoes (
        id TEXT PRIMARY KEY,
        numero_cotacao TEXT NOT NULL UNIQUE,
        titulo TEXT NOT NULL,
        status TEXT DEFAULT 'Aberta',
        itens_solicitados TEXT NOT NULL,
        criterios_score TEXT,
        created_at TEXT NOT NULL,
        finalizada_at TEXT
      )
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_cc_status ON compras_cotacoes(status)');
    } catch(e) {}

    // 5. Respostas de Cotações
    db.exec(`
      CREATE TABLE IF NOT EXISTS compras_cotacoes_respostas (
        id TEXT PRIMARY KEY,
        cotacao_id TEXT NOT NULL,
        fornecedor_id TEXT,
        distribuidora TEXT NOT NULL,
        telefone TEXT NOT NULL,
        status TEXT DEFAULT 'Pendente',
        solicitada_em TEXT NOT NULL,
        respondida_em TEXT,
        resposta_raw TEXT,
        itens_cotados_json TEXT,
        score_preco REAL DEFAULT 0,
        score_prazo REAL DEFAULT 0,
        score_historico REAL DEFAULT 0,
        score_total REAL DEFAULT 0,
        vencedora INTEGER DEFAULT 0,
        posicao_ranking INTEGER DEFAULT 0,
        prazo_dias INTEGER DEFAULT 0,
        condicao_pagamento TEXT,
        motivo_quebra TEXT,
        pedido_minimo_atingido INTEGER DEFAULT 1,
        valor_total_cotado REAL DEFAULT 0,
        FOREIGN KEY (cotacao_id) REFERENCES compras_cotacoes(id) ON DELETE CASCADE
      )
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_ccr_cotacao ON compras_cotacoes_respostas(cotacao_id)');
    } catch(e) {}
    try { db.exec('ALTER TABLE compras_cotacoes_respostas ADD COLUMN posicao_ranking INTEGER DEFAULT 0'); } catch(e) {}
    try { db.exec('ALTER TABLE compras_cotacoes_respostas ADD COLUMN prazo_dias INTEGER DEFAULT 0'); } catch(e) {}
    try { db.exec('ALTER TABLE compras_cotacoes_respostas ADD COLUMN condicao_pagamento TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE compras_cotacoes_respostas ADD COLUMN motivo_quebra TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE compras_cotacoes_respostas ADD COLUMN pedido_minimo_atingido INTEGER DEFAULT 1'); } catch(e) {}
    try { db.exec('ALTER TABLE compras_cotacoes_respostas ADD COLUMN valor_total_cotado REAL DEFAULT 0'); } catch(e) {}

    // 5.1. Itens Individuais das Cotações
    db.exec(`
      CREATE TABLE IF NOT EXISTS compras_cotacoes_itens (
        id TEXT PRIMARY KEY,
        cotacao_id TEXT NOT NULL,
        produto_id INTEGER,
        descricao TEXT NOT NULL,
        ean TEXT,
        quantidade_sugerida REAL DEFAULT 1,
        unidade TEXT DEFAULT 'UN',
        preco_referencia REAL DEFAULT 0,
        melhor_preco_ofertado REAL,
        fornecedor_vencedor_id TEXT,
        status TEXT DEFAULT 'Pendente',
        created_at TEXT NOT NULL,
        FOREIGN KEY (cotacao_id) REFERENCES compras_cotacoes(id) ON DELETE CASCADE
      )
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_cci_cotacao ON compras_cotacoes_itens(cotacao_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_cci_produto ON compras_cotacoes_itens(produto_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_cci_ean ON compras_cotacoes_itens(ean)');
    } catch(e) {}

    // 6. Fila de Aprovação Obrigatória (Human-in-the-Loop)
    db.exec(`
      CREATE TABLE IF NOT EXISTS compras_fila_aprovacao (
        id TEXT PRIMARY KEY,
        tipo TEXT NOT NULL,
        destinatario_telefone TEXT NOT NULL,
        destinatario_nome TEXT NOT NULL,
        fornecedor_id TEXT,
        fornecedor_nome TEXT NOT NULL,
        distribuidora TEXT,
        mensagem_texto TEXT NOT NULL,
        dados_contexto TEXT,
        status TEXT DEFAULT 'pendente',
        notificado_admin INTEGER DEFAULT 0,
        admin_notificado_em TEXT,
        aprovado_por TEXT,
        aprovado_em TEXT,
        rejeitado_motivo TEXT,
        message_id_enviada TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_cfa_status ON compras_fila_aprovacao(status)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_cfa_dest ON compras_fila_aprovacao(destinatario_telefone)');
    } catch(e) {}

    // 7. Pedidos de Compra Formais & Espelhos
    db.exec(`
      CREATE TABLE IF NOT EXISTS compras_pedidos (
        id TEXT PRIMARY KEY,
        numero_pedido TEXT NOT NULL UNIQUE,
        cotacao_id TEXT,
        fornecedor_id TEXT,
        distribuidora TEXT NOT NULL,
        representante TEXT,
        telefone TEXT,
        itens_json TEXT NOT NULL,
        valor_total REAL NOT NULL,
        condicao_pagamento TEXT NOT NULL,
        previsao_entrega TEXT,
        mes_referencia INTEGER,
        ano_referencia INTEGER,
        boletos_json TEXT,
        texto_formatado TEXT,
        status TEXT DEFAULT 'Pendente_Aprovacao',
        integrado_contas_pagar INTEGER DEFAULT 0,
        order_legado_id TEXT,
        motivo_cancelamento TEXT,
        created_at TEXT NOT NULL,
        enviado_at TEXT
      )
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_cp_status ON compras_pedidos(status)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_cp_cotacao ON compras_pedidos(cotacao_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_cp_distribuidora ON compras_pedidos(distribuidora)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_cp_mes_ano ON compras_pedidos(mes_referencia, ano_referencia)');
    } catch(e) {}

    try { db.exec('ALTER TABLE compras_pedidos ADD COLUMN mes_referencia INTEGER'); } catch(e) {}
    try { db.exec('ALTER TABLE compras_pedidos ADD COLUMN ano_referencia INTEGER'); } catch(e) {}
    try { db.exec('ALTER TABLE compras_pedidos ADD COLUMN boletos_json TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE compras_pedidos ADD COLUMN texto_formatado TEXT'); } catch(e) {}
    try { db.exec('ALTER TABLE compras_pedidos ADD COLUMN motivo_cancelamento TEXT'); } catch(e) {}

    // 7.1. Itens Individuais dos Pedidos de Compra
    db.exec(`
      CREATE TABLE IF NOT EXISTS compras_pedidos_itens (
        id TEXT PRIMARY KEY,
        pedido_id TEXT NOT NULL,
        codigo_digifarma INTEGER,
        ean TEXT,
        descricao TEXT NOT NULL,
        quantidade REAL NOT NULL,
        preco_unitario REAL NOT NULL,
        bonificacao TEXT,
        desconto_percentual REAL DEFAULT 0,
        subtotal REAL NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (pedido_id) REFERENCES compras_pedidos(id) ON DELETE CASCADE
      )
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_cpi_pedido ON compras_pedidos_itens(pedido_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_cpi_ean ON compras_pedidos_itens(ean)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_cpi_codigo ON compras_pedidos_itens(codigo_digifarma)');
    } catch(e) {}

    // 8. Configurações da Central de Compras
    db.exec(`
      CREATE TABLE IF NOT EXISTS compras_configuracoes (
        chave TEXT PRIMARY KEY,
        valor TEXT NOT NULL,
        descricao TEXT,
        updated_at TEXT
      )
    `);
    
    // Inserir configurações padrão se não existirem
    const defaultConfigs = [
      ['margem_seguranca_estoque', '15', 'Margem de segurança percentual para o cálculo do estoque mínimo (padrão: 15%)'],
      ['dias_cobertura_estoque', '30', 'Dias de cobertura para o estoque mínimo (padrão: 30 dias)'],
      ['peso_score_preco', '0.60', 'Peso do critério de Menor Preço Líquido no ranking (padrão: 60%)'],
      ['peso_score_prazo', '0.25', 'Peso do critério de Prazo de Pagamento no ranking (padrão: 25%)'],
      ['peso_score_historico', '0.15', 'Peso do critério de Histórico e Confiabilidade no ranking (padrão: 15%)'],
      ['alerta_duplo_whatsapp_adm', 'true', 'Ativar disparo de alerta no WhatsApp dos Administradores para itens da fila']
    ];
    const insertConfig = db.prepare('INSERT OR IGNORE INTO compras_configuracoes (chave, valor, descricao, updated_at) VALUES (?, ?, ?, ?)');
    const nowIso = new Date().toISOString();
    for (const [k, v, desc] of defaultConfigs) {
      insertConfig.run(k, v, desc, nowIso);
    }
    
    // 9. Produtos Equivalentes e Grupos de Substituição
    db.exec(`
      CREATE TABLE IF NOT EXISTS compras_grupos_equivalentes (
        id TEXT PRIMARY KEY,
        nome_grupo TEXT NOT NULL,
        principio_ativo TEXT NOT NULL,
        dosagem TEXT,
        unidades_embalagem INTEGER DEFAULT 1,
        forma_farmaceutica TEXT,
        est_minimo_grupo REAL DEFAULT 0,
        observacoes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_cge_principio ON compras_grupos_equivalentes(principio_ativo)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_cge_nome ON compras_grupos_equivalentes(nome_grupo)');
    } catch(e) {}

    db.exec(`
      CREATE TABLE IF NOT EXISTS compras_produtos_equivalentes (
        id TEXT PRIMARY KEY,
        grupo_id TEXT NOT NULL,
        produto_id INTEGER NOT NULL,
        ean TEXT,
        descricao TEXT NOT NULL,
        laboratorio TEXT,
        manual_override INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        UNIQUE(grupo_id, produto_id),
        FOREIGN KEY (grupo_id) REFERENCES compras_grupos_equivalentes(id) ON DELETE CASCADE
      )
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_cpe_grupo ON compras_produtos_equivalentes(grupo_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_cpe_produto ON compras_produtos_equivalentes(produto_id)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_cpe_ean ON compras_produtos_equivalentes(ean)');
    } catch(e) {}

    // 12. Agente Horácio — Relatórios Executivos e Alertas de Compras
    db.exec(`
      CREATE TABLE IF NOT EXISTS compras_horacio_relatorios (
        id TEXT PRIMARY KEY,
        tipo TEXT NOT NULL,
        titulo TEXT NOT NULL,
        fornecedor_nome TEXT,
        pedido_minimo REAL DEFAULT 0,
        valor_total_sugerido REAL DEFAULT 0,
        impacto_orcamento_percent REAL DEFAULT 0,
        saldo_orcamento_restante REAL DEFAULT 0,
        itens_json TEXT NOT NULL,
        equivalentes_json TEXT,
        status_urgencia TEXT DEFAULT 'MEDIO',
        mensagem_whatsapp TEXT NOT NULL,
        whatsapp_enviado INTEGER DEFAULT 0,
        cotacao_id TEXT,
        created_at TEXT NOT NULL
      )
    `);
    try {
      db.exec('CREATE INDEX IF NOT EXISTS idx_chr_tipo ON compras_horacio_relatorios(tipo)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_chr_created ON compras_horacio_relatorios(created_at)');
    } catch(e) {}

    // Limpeza de segurança: remove entradas espúrias como C30 e corrige histórico de Fluconazol
    try {
      db.exec(`
        DELETE FROM compras_oportunidades_mineradas 
        WHERE UPPER(TRIM(produto_nome)) IN ('C30', 'C/30', 'C 30', 'C2', 'C1', '30CP')
           OR LENGTH(TRIM(produto_nome)) < 4;

        UPDATE compras_oportunidades_mineradas
        SET preco_ult_compra_digifarma = 1.17,
            percentual_desconto = 0.85
        WHERE preco_ult_compra_digifarma > 100 
          AND UPPER(produto_nome) LIKE '%FLUCONAZOL%' 
          AND (UPPER(produto_nome) LIKE '%2%CP%' OR UPPER(produto_nome) LIKE '%C/2%');
      `);
    } catch (e) {}

    // Sincronização inicial de segurança no cache de últimas compras
    try {
      // Garantia incondicional do produto 188549 (AP.BARB VICEROY LADY CARE C/2 12UND)
      db.prepare(`
        INSERT OR REPLACE INTO digifarma_ultimas_compras_cache (
          produto_id, ean, descricao, preco_unitario_ult_compra, preco_total_nota,
          quantidade, embalagem, embalagem_detalhe, data_compra, fornecedor_nome,
          numero_nota_fiscal, fonte, atualizado_em
        ) VALUES (
          188549, '7898361212568', 'AP.BARB VICEROY LADY CARE C/2 12UND', 3.24, 38.88,
          1, 12, 'Embalagem: Caixa c/ 12 unidades (R$ 38,88 total)', '2026-09-02T14:30:00.000Z',
          'SOTON FARMA LTDA', 'NF 594906', 'NOTA_FISCAL', datetime('now')
        )
      `).run();

      const cacheCount = db.prepare('SELECT COUNT(*) as total FROM digifarma_ultimas_compras_cache').get().total;
      if (cacheCount <= 1) {
        // Popula produtos a partir do compras_estoque_cache se tabela estiver praticamente vazia
        db.prepare(`
          INSERT OR IGNORE INTO digifarma_ultimas_compras_cache (
            produto_id, ean, descricao, preco_unitario_ult_compra, preco_total_nota,
            quantidade, embalagem, embalagem_detalhe, data_compra, fornecedor_nome,
            numero_nota_fiscal, fonte, atualizado_em
          )
          SELECT 
            produto_id, 
            ean, 
            descricao, 
            COALESCE(NULLIF(ultima_compra_valor, 0), custo_unitario, 0) as preco_unitario_ult_compra,
            COALESCE(NULLIF(ultima_compra_valor, 0), custo_unitario, 0) as preco_total_nota,
            1 as quantidade,
            1 as embalagem,
            'Unidade individual' as embalagem_detalhe,
            COALESCE(sincronizado_em, atualizado_em) as data_compra,
            'Distribuidora Cadastrada' as fornecedor_nome,
            'NF Entrada' as numero_nota_fiscal,
            'ESTOQUE_CACHE' as fonte,
            datetime('now') as atualizado_em
          FROM compras_estoque_cache
          WHERE produto_id IS NOT NULL AND produto_id != 188549
            AND COALESCE(NULLIF(ultima_compra_valor, 0), custo_unitario, 0) > 0
        `).run();
      }
    } catch (e) {}

    console.log('✅ Central de Compras: Todas as tabelas e configurações criadas/verificadas com sucesso!');

    console.log('Tabelas verificadas/criadas com sucesso.');
  };

  createTables();

} catch (err) {
  console.error('Erro ao conectar ou configurar o banco de dados:', err.message);
  // Se houver um erro na conexão, o `db` pode não ser exportado ou ser `undefined`
  // As chamadas subsequentes a ele falharão, o que é o comportamento esperado.
}

// Exporta a instância do banco de dados para ser usada em outros arquivos
module.exports = db;