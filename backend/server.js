const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
let db = require('./database.js');
const InterPixService = require('./services/inter-pix.service.js');
const interPixService = new InterPixService(db);
const multer = require('multer');
const fs = require('fs');
const fetch = require('node-fetch');
const config = require('./config.js');
const { queryDigifarma } = require('./services/digifarma.service');

const app = express();
const PORT = 3001;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Redirecionar logs para arquivo persistente (volume Docker /data)
const LOG_DIR = process.platform === 'win32' 
  ? path.join(__dirname) 
  : path.join(__dirname, 'data');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const logStream = fs.createWriteStream(path.join(LOG_DIR, 'backend.log'), { flags: 'a' });
const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
    const msg = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
    logStream.write(msg);
    originalLog.apply(console, args);
};

console.error = (...args) => {
    const msg = `[${new Date().toISOString()}] ❌ ERROR: ${args.join(' ')}\n`;
    logStream.write(msg);
    originalError.apply(console, args);
};

const safelyParseJSON = (jsonString, fallback = []) => {
  try {
    if (!jsonString) return fallback;
    return JSON.parse(jsonString);
  } catch (e) {
    console.error('JSON Parse Error:', e.message, 'Input:', jsonString);
    return fallback;
  }
};

app.get('/api/backups', (req, res) => {
  const backupDir = config.backupDir;

  if (!fs.existsSync(backupDir)) {
    try {
      fs.mkdirSync(backupDir, { recursive: true });
    } catch (err) {
      console.error('Error creating backup directory:', err);
      // Return empty list if we can't create dir, or maybe error?
      return res.json([]); 
    }
  }

  fs.readdir(backupDir, (err, files) => {
    if (err) {
      console.error('Error reading backup directory:', err);
      return res.status(500).json({ error: 'Failed to list backups.' });
    }
    
    const backups = files
      .filter(file => file.endsWith('.db') || file.endsWith('.sqlite'))
      .map(file => {
        try {
            const stats = fs.statSync(path.join(backupDir, file));
            return {
            name: file,
            size: stats.size,
            date: stats.mtime,
            };
        } catch (e) {
            return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by date desc

    res.json(backups);
  });
});

app.post('/api/backups/create', (req, res) => {
  const backupDir = config.backupDir;
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const filename = `belinha_${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
  const sourcePath = config.dbPath;

  console.log(`Creating backup... Source: ${sourcePath}, Dest: ${path.join(backupDir, filename)}`);

  try {
    // Verify source exists
    if (!fs.existsSync(sourcePath)) {
        throw new Error(`Source database not found at ${sourcePath}`);
    }

    fs.copyFileSync(sourcePath, path.join(backupDir, filename));
    
    // Clean up old backups (keep last 30)
    fs.readdir(backupDir, (err, files) => {
        if (!err) {
            const dbFiles = files.filter(f => f.endsWith('.db')).sort();
            if (dbFiles.length > 30) {
                const toDelete = dbFiles.slice(0, dbFiles.length - 30);
                toDelete.forEach(f => {
                    try { fs.unlinkSync(path.join(backupDir, f)); } catch(e) {}
                });
            }
        }
    });

    res.json({ message: 'Backup created successfully', filename });
  } catch(e) {
    console.error('Backup creation error:', e);
    return res.status(500).json({ error: 'Failed to create backup.', details: e.message });
  }
});

// Restore is dangerous, so we just run the restore script which handles logic
app.post('/api/backups/:filename/restore', (req, res) => {
  const { filename } = req.params;
  const backupDir = path.join(__dirname, process.platform === 'win32' ? '../backups_dev_simulated' : 'data/backups');
  const backupPath = path.join(backupDir, filename);

  // Determine source DB path (target for restore)
  let targetPath = process.env.DB_PATH || path.join(__dirname, 'belafarma.db');
  if (process.platform === 'win32') {
     targetPath = path.join(__dirname, 'belafarma.db');
  } else {
     // Docker fallback
      if (!fs.existsSync(targetPath)) {
        targetPath = path.join(__dirname, 'data/belafarma.db');
      }
  }

  if (!fs.existsSync(backupPath)) {
    return res.status(404).json({ error: 'Backup file not found.' });
  }

  console.log(`Restoring backup... Source: ${backupPath}, Target: ${targetPath}`);

  try {
    // 1. Close current connection
    if (db && db.open) {
      console.log('Closing database connection...');
      db.close();
    }

    // 1.5 Delete WAL and SHM files if they exist to prevent corruption/stale data
    const walPath = `${targetPath}-wal`;
    const shmPath = `${targetPath}-shm`;
    try {
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
        console.log('Cleaned up WAL/SHM files.');
    } catch (cleanupErr) {
        console.warn('Warning: Failed to clean up WAL/SHM files:', cleanupErr.message);
    }

    // 2. Overwrite database file
    console.log('Copying backup file...');
    fs.copyFileSync(backupPath, targetPath);

    // 3. Re-open connection
    console.log('Reconnecting database...');
    // Clear require cache to force re-execution of database.js logic
    delete require.cache[require.resolve('./database.js')];
    db = require('./database.js');
    
    // Check connection
    if (db && db.open) {
        console.log('Database restored and reconnected successfully.');
         res.json({ message: 'Database restored successfully! The page will refresh.' });
    } else {
        throw new Error('Failed to reconnect to database after restore.');
    }

  } catch (e) {
    console.error('Restore error:', e);
    // Try to reconnect if it failed
    try {
        delete require.cache[require.resolve('./database.js')];
        db = require('./database.js');
    } catch (reconnectErr) {
        console.error('CRITICAL: Failed to recover DB connection after error:', reconnectErr);
    }
    
    return res.status(500).json({ error: 'Failed to restore backup.', details: e.message });
  }
});



// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});


// Basic route to check if server is running
app.get('/', (req, res) => {
  res.json({ message: 'BelaFarma Backend API is running!' });
});

// Endpoint to get all initial data
app.use('/api', (req, res, next) => {
  if (!db || db.open === false) { // Check if db exists and is open
    console.error('CRITICAL: Database connection is not established or closed.');
    return res.status(503).json({ error: 'Database service unavailable. Please check server logs.' });
  }
  next();
});

app.get('/api/all-data', (req, res) => {
  if (!db) {
    return res.status(500).json({ error: 'Database connection not established.' });
  }
  try {
    const users = db.prepare('SELECT * FROM users').all();
    const ordersRaw = db.prepare('SELECT * FROM orders ORDER BY orderDate DESC').all();
    const shortagesRaw = db.prepare('SELECT * FROM shortages ORDER BY createdAt DESC').all();
    const logs = db.prepare('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100').all();

    // Process data before sending
    const orders = ordersRaw.map(order => ({
      ...order,
      installments: safelyParseJSON(order.installments),
      isFogueteAmarelo: !!order.isFogueteAmarelo,
    }));

    const shortages = shortagesRaw.map(shortage => ({
      ...shortage,
      clientInquiry: !!shortage.clientInquiry, // Convert 0/1 back to false/true
      purchased: !!shortage.purchased,
      ordered: !!shortage.ordered,
    }));
    
    const cashClosings = db.prepare('SELECT * FROM cash_closings ORDER BY date DESC').all();
    
    // Buscar boletos normais e títulos Foguete Amarelo (mesma lógica do /api/boletos)
    const boletosNormais = db.prepare('SELECT * FROM boletos ORDER BY due_date').all();
    const boletosFogueteAmarelo = db.prepare(`
      SELECT 
        id,
        supplier_name as supplierName,
        description as invoice_number,
        due_date,
        remaining_value as value,
        CASE 
          WHEN status = 'Quitado' THEN 'Pago'
          WHEN status = 'Pendente' AND julianday(due_date) < julianday('now') THEN 'Vencido'
          ELSE 'Pendente'
        END as status,
        reference_id as order_id
      FROM accounts_payable
      WHERE is_foguete_amarelo = 1
    `).all();
    
    // Combinar e ordenar boletos
    const boletos = [...boletosNormais, ...boletosFogueteAmarelo].sort((a, b) => {
      const dateA = new Date(a.due_date);
      const dateB = new Date(b.due_date);
      return dateA - dateB;
    });
    
    const monthlyLimits = db.prepare('SELECT * FROM monthly_limits').all();
    const dailyRecords = db.prepare('SELECT * FROM daily_records ORDER BY date DESC').all().map(record => {
      const mapped = {
        ...record,
        expenses: safelyParseJSON(record.expenses),
        nonRegistered: safelyParseJSON(record.nonRegistered),
        pixDiretoList: safelyParseJSON(record.pixDiretoList),
        crediarioList: safelyParseJSON(record.crediarioList),
        creditReceipts: safelyParseJSON(record.creditReceipts),
        sangrias: safelyParseJSON(record.sangrias), // Parse sangrias
        lancado: !!record.lancado, // Convert 0/1 to boolean
      };
      console.log('Daily record from DB:', {
        id: record.id,
        lancadoDB: record.lancado,
        lancadoMapped: mapped.lancado,
        date: record.date
      });
      return mapped;
    });

    res.json({
      users: { documents: users },
      orders: { documents: orders },
      shortages: { documents: shortages },
      logs: { documents: logs },
      cashClosings: { documents: cashClosings },
      boletos: { documents: boletos },
      monthlyLimits: { documents: monthlyLimits },
      dailyRecords: { documents: dailyRecords },
      fixedAccounts: { documents: db.prepare('SELECT * FROM fixed_accounts').all().map(acc => ({ ...acc, isActive: !!acc.isActive })) },
    });
  } catch (err) {
    console.error('Error fetching all data:', err);
    res.status(500).json({ error: 'Failed to fetch data from the database.' });
  }
});

// --- Monthly Limits CUD ---
app.post('/api/monthly-limits', (req, res) => {
  try {
    const { month, year, limit } = req.body;
    const stmt = db.prepare(`
      INSERT INTO monthly_limits (month, year, "limit")
      VALUES (@month, @year, @limit)
      ON CONFLICT(month, year) DO UPDATE SET "limit" = excluded."limit";
    `);
    stmt.run({ month, year, limit });
    res.status(201).json({ message: 'Monthly limit saved successfully.' });
  } catch (err) {
    console.error('Error saving monthly limit:', err);
    res.status(500).json({ error: 'Failed to save monthly limit.' });
  }
});


// --- Fixed Accounts CUD ---
app.get('/api/fixed-accounts', (req, res) => {
  try {
    const accounts = db.prepare('SELECT * FROM fixed_accounts').all().map(acc => ({
      ...acc,
      isActive: !!acc.isActive
    }));
    res.json(accounts);
  } catch (err) {
    console.error('Error fetching fixed accounts:', err);
    res.status(500).json({ error: 'Failed to fetch fixed accounts.' });
  }
});

app.post('/api/fixed-accounts', (req, res) => {
  try {
    const { id, name, value, dueDay, isActive } = req.body;
    
    db.transaction(() => {
      // 1. Cria o template
      const stmt = db.prepare(`
        INSERT INTO fixed_accounts (id, name, value, dueDay, isActive)
        VALUES (@id, @name, @value, @dueDay, @isActive)
      `);
      stmt.run({
        id,
        name,
        value: parseFloat(value),
        dueDay: parseInt(dueDay),
        isActive: isActive ? 1 : 0
      });

      // 2. Se estiver ativa, já gera o pagamento para o mês atual para aparecer nos relatórios
      if (isActive) {
        const now = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const dueDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
        
        db.prepare(`
          INSERT INTO fixed_account_payments 
          (id, fixedAccountId, fixedAccountName, value, dueDate, month, status)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          `fap_${Date.now()}_init`,
          id,
          name,
          parseFloat(value),
          dueDate,
          month,
          'Pendente'
        );
      }
    })();

    res.status(201).json({ message: 'Fixed account created and initialized.' });
  } catch (err) {
    console.error('Error creating fixed account:', err);
    res.status(500).json({ error: 'Failed to create fixed account.' });
  }
});

app.put('/api/fixed-accounts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, value, dueDay, isActive } = req.body;
    
    db.transaction(() => {
      // 1. Atualiza o template da conta fixa
      const stmt = db.prepare(`
        UPDATE fixed_accounts 
        SET name = @name, value = @value, dueDay = @dueDay, isActive = @isActive
        WHERE id = @id
      `);
      const result = stmt.run({
        id,
        name,
        value: parseFloat(value),
        dueDay: parseInt(dueDay),
        isActive: isActive ? 1 : 0
      });

      if (result.changes > 0) {
        // 2. Atualiza os pagamentos pendentes já gerados para refletir os novos valores/nomes
        // Também atualiza o dueDate se o dueDay mudou
        const updatePaymentsStmt = db.prepare(`
          UPDATE fixed_account_payments 
          SET value = ?, 
              fixedAccountName = ?,
              dueDate = substr(month, 1, 7) || '-' || printf('%02d', ?)
          WHERE fixedAccountId = ? AND status = 'Pendente'
        `);
        updatePaymentsStmt.run(parseFloat(value), name, parseInt(dueDay), id);

        // Se a conta foi desativada, remove os pagamentos pendentes já gerados
        if (!isActive) {
          db.prepare(`
            DELETE FROM fixed_account_payments 
            WHERE fixedAccountId = ? AND status = 'Pendente'
          `).run(id);
        }
      }
    })();

    res.status(200).json({ message: 'Fixed account and pending payments updated successfully.' });
  } catch (err) {
    console.error('Error updating fixed account:', err);
    res.status(500).json({ error: 'Failed to update fixed account.' });
  }
});

app.delete('/api/fixed-accounts/:id', (req, res) => {
  const { id } = req.params;
  console.log(`[FixedAccounts] Tentando excluir conta fixa: ${id}`);

  try {
    const result = db.transaction(() => {
      // 1. Opcional: Deleta pagamentos pendentes associados primeiro
      // Se a conta fixa foi excluída, geralmente não queremos mais pagar as instâncias pendentes futuras
      const deletePaymentsStmt = db.prepare(`
        DELETE FROM fixed_account_payments 
        WHERE fixedAccountId = ? AND status = 'Pendente'
      `);
      const paymentChanges = deletePaymentsStmt.run(id).changes;
      console.log(`[FixedAccounts] ${paymentChanges} pagamentos pendentes removidos para a conta ${id}`);

      // 2. Deleta o template da conta fixa
      const stmt = db.prepare('DELETE FROM fixed_accounts WHERE id = ?');
      const deleteResult = stmt.run(id);
      
      return deleteResult;
    })();
    
    if (result.changes === 0) {
      console.warn(`[FixedAccounts] Nenhuma conta fixa encontrada com o ID: ${id}`);
      return res.status(404).json({ error: 'Conta fixa não encontrada no banco de dados.' });
    }

    console.log(`[FixedAccounts] Conta ${id} excluída com sucesso.`);
    res.status(200).json({ message: 'Conta fixa e pagamentos pendentes excluídos com sucesso.' });
  } catch (err) {
    console.error(`[FixedAccounts] Erro crítico ao excluir conta ${id}:`, err);
    res.status(500).json({ error: 'Erro interno ao excluir a conta: ' + err.message });
  }
});

// --- FIXED ACCOUNT PAYMENTS ENDPOINTS ---

// GET /api/fixed-account-payments - Get payments for a specific month (with auto-generation)
app.get('/api/fixed-account-payments', (req, res) => {
  try {
    const { month } = req.query; // Esperado: YYYY-MM
    
    if (!month) {
      return res.status(400).json({ error: 'Month parameter is required' });
    }
    
    // 1. Pega os templates de contas ativas
    const activeAccounts = db.prepare('SELECT * FROM fixed_accounts WHERE isActive = 1').all();
    
    // 2. Pega os pagamentos que já existem para este mês
    const existingPayments = db.prepare('SELECT * FROM fixed_account_payments WHERE month = ?').all(month);
    const existingAccountIds = new Set(existingPayments.map(p => p.fixedAccountId));

    // 3. Verifica se alguma conta ativa ESTÁ FALTANDO para este mês e cria
    const toCreate = activeAccounts.filter(acc => !existingAccountIds.has(acc.id));
    
    if (toCreate.length > 0) {
      db.transaction(() => {
        toCreate.forEach(acc => {
          const [year, monthNum] = month.split('-');
          const dueDay = String(acc.dueDay).padStart(2, '0');
          const dueDate = `${year}-${monthNum}-${dueDay}`;
          
          db.prepare(`
            INSERT INTO fixed_account_payments 
            (id, fixedAccountId, fixedAccountName, value, dueDate, month, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            `fap_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            acc.id,
            acc.name,
            acc.value,
            dueDate,
            month,
            'Pendente'
          );
        });
      })();
      
      // Retorna a lista atualizada
      return res.json(db.prepare('SELECT * FROM fixed_account_payments WHERE month = ?').all(month));
    }
    
    res.json(existingPayments);
  } catch (error) {
    console.error('Error fetching fixed account payments:', error);
    res.status(500).json({ error: 'Failed to fetch fixed account payments' });
  }
});

// PUT /api/fixed-account-payments/:id - Update payment status
app.put('/api/fixed-account-payments/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { status, paidAt, notes } = req.body;
    
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    
    const stmt = db.prepare(`
      UPDATE fixed_account_payments 
      SET status = ?, paidAt = ?, notes = ?
      WHERE id = ?
    `);
    
    const result = stmt.run(status, paidAt || null, notes || null, id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    res.json({ success: true, message: 'Payment updated successfully' });
  } catch (error) {
    console.error('Error updating fixed account payment:', error);
    res.status(500).json({ error: 'Failed to update payment' });
  }
});

// GET /api/fixed-account-payments/history/:fixedAccountId - Get payment history
app.get('/api/fixed-account-payments/history/:fixedAccountId', (req, res) => {
  try {
    const { fixedAccountId } = req.params;
    const payments = db.prepare(
      'SELECT * FROM fixed_account_payments WHERE fixedAccountId = ? ORDER BY dueDate DESC'
    ).all(fixedAccountId);
    
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});


// --- AUTH ---
app.post('/api/login', (req, res) => {
  try {
    const { accessKey } = req.body;
    const MASTER_KEY = 'belafarma2024';

    if (!accessKey) {
      return res.status(400).json({ error: 'Access key is required.' });
    }

    // 1. Check for Master Key
    if (accessKey === MASTER_KEY) {
      const masterUser = { 
        id: 'master-admin', 
        name: 'Administrador Bela', 
        role: 'Administrador', // Assuming 'Administrador' is the value for UserRole.ADM
        accessKey: MASTER_KEY 
      };
      return res.status(200).json(masterUser);
    }
    
    // 2. Check for user in the database
    const stmt = db.prepare('SELECT * FROM users WHERE accessKey = ?');
    const user = stmt.get(accessKey);

    if (user) {
      res.status(200).json(user);
    } else {
      res.status(401).json({ error: 'Chave de acesso não autorizada.' });
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});


// TODO: Add API routes for CUD operations (Create, Update, Delete)

// --- Orders CUD ---
// CREATE Order
app.post('/api/orders', upload.single('boletoFile'), (req, res) => {
  console.log('[ORDERS] Recebendo novo pedido:', req.body.id, 'de', req.body.distributor);
  try {
    const order = { ...req.body };
    if (req.file) {
      order.boletoPath = req.file.path;
      console.log('[ORDERS] Boleto anexado:', req.file.filename);
    }

    // Conversão explícita para garantir integridade numérica no SQLite
    const totalValue = parseFloat(order.totalValue);
    if (isNaN(totalValue)) {
      console.error('[ORDERS] Erro: valor total inválido:', order.totalValue);
      return res.status(400).json({ error: 'Valor total inválido.' });
    }

    const stmt = db.prepare(`
      INSERT INTO orders (id, orderDate, distributor, seller, totalValue, arrivalForecast, status, paymentMonth, invoiceNumber, paymentMethod, receiptDate, notes, installments, isFogueteAmarelo, boletoPath)
      VALUES (@id, @orderDate, @distributor, @seller, @totalValue, @arrivalForecast, @status, @paymentMonth, @invoiceNumber, @paymentMethod, @receiptDate, @notes, @installments, @isFogueteAmarelo, @boletoPath)
    `);
    
    db.transaction(() => {
      stmt.run({
        id: order.id || null,
        orderDate: order.orderDate || null,
        distributor: order.distributor || null,
        seller: order.seller || null,
        totalValue: totalValue,
        arrivalForecast: order.arrivalForecast || null,
        status: order.status || null,
        paymentMonth: order.paymentMonth || null,
        invoiceNumber: order.invoiceNumber || null,
        paymentMethod: order.paymentMethod || null,
        receiptDate: order.receiptDate || null,
        notes: order.notes || null,
        installments: typeof order.installments === 'string' ? order.installments : JSON.stringify(order.installments || []),
        isFogueteAmarelo: (order.isFogueteAmarelo === 'true' || order.isFogueteAmarelo === true || order.isFogueteAmarelo == 1) ? 1 : 0,
        boletoPath: order.boletoPath || null
      });

      // Sincronizar boletos se a forma de pagamento for Boleto e não for Foguete Amarelo
      if (order.paymentMethod === 'Boleto' && !(order.isFogueteAmarelo === 'true' || order.isFogueteAmarelo === true || order.isFogueteAmarelo == 1)) {
        let installmentsList = [];
        try {
          installmentsList = typeof order.installments === 'string' ? JSON.parse(order.installments) : (order.installments || []);
        } catch (parseErr) {
          console.error('[ORDERS] Erro ao fazer parse de installments na criação:', parseErr);
        }

        if (installmentsList.length > 0) {
          const insertStmt = db.prepare(`
            INSERT INTO boletos (id, supplierName, order_id, due_date, value, status, invoice_number)
            VALUES (@id, @supplierName, @order_id, @due_date, @value, @status, @invoice_number)
          `);

          installmentsList.forEach((inst, index) => {
            insertStmt.run({
              id: `${order.id}-boleto-${index + 1}`,
              supplierName: order.distributor || null,
              order_id: order.id,
              due_date: inst.dueDate,
              value: parseFloat(inst.value),
              status: 'Pendente',
              invoice_number: order.invoiceNumber || null
            });
          });
          console.log(`[ORDERS] ${installmentsList.length} boletos gerados e salvos para o pedido ${order.id}`);
        }
      }
    })();

    console.log('[ORDERS] Pedido salvo com sucesso.');
    res.status(201).json({ id: order.id });
  } catch (err) {
    console.error('[ORDERS] Erro ao criar pedido:', err);
    res.status(500).json({ error: 'Failed to create order.', details: err.message });
  }
});

// UPDATE Order
app.put('/api/orders/:id', upload.single('boletoFile'), (req, res) => {
  const { id } = req.params;
  console.log('[ORDERS] Atualizando pedido:', id);
  try {
    const order = { ...req.body };
    if (req.file) {
      order.boletoPath = req.file.path;
      console.log('[ORDERS] Novo boleto anexado:', req.file.filename);
    }

    // Conversão explícita
    const totalValue = parseFloat(order.totalValue);
    if (isNaN(totalValue)) {
      console.error('[ORDERS] Erro: valor total inválido na atualização:', order.totalValue);
      return res.status(400).json({ error: 'Valor total inválido.' });
    }

    const stmt = db.prepare(`
      UPDATE orders 
      SET orderDate = @orderDate, distributor = @distributor, seller = @seller, totalValue = @totalValue, arrivalForecast = @arrivalForecast, status = @status, paymentMonth = @paymentMonth, invoiceNumber = @invoiceNumber, paymentMethod = @paymentMethod, receiptDate = @receiptDate, notes = @notes, installments = @installments, isFogueteAmarelo = @isFogueteAmarelo, boletoPath = @boletoPath
      WHERE id = @id
    `);

    let result;
    db.transaction(() => {
      result = stmt.run({
        id,
        orderDate: order.orderDate || null,
        distributor: order.distributor || null,
        seller: order.seller || null,
        totalValue: totalValue,
        arrivalForecast: order.arrivalForecast || null,
        status: order.status || null,
        paymentMonth: order.paymentMonth || null,
        invoiceNumber: order.invoiceNumber || null,
        paymentMethod: order.paymentMethod || null,
        receiptDate: order.receiptDate || null,
        notes: order.notes || null,
        installments: typeof order.installments === 'string' ? order.installments : JSON.stringify(order.installments || []),
        isFogueteAmarelo: (order.isFogueteAmarelo === 'true' || order.isFogueteAmarelo === true || order.isFogueteAmarelo == 1) ? 1 : 0,
        boletoPath: order.boletoPath || null
      });

      if (result.changes > 0) {
        // Sincronizar boletos se a forma de pagamento for Boleto e não for Foguete Amarelo
        if (order.paymentMethod === 'Boleto' && !(order.isFogueteAmarelo === 'true' || order.isFogueteAmarelo === true || order.isFogueteAmarelo == 1)) {
          let installmentsList = [];
          try {
            installmentsList = typeof order.installments === 'string' ? JSON.parse(order.installments) : (order.installments || []);
          } catch (parseErr) {
            console.error('[ORDERS] Erro ao fazer parse de installments na atualização:', parseErr);
          }

          const deleteStmt = db.prepare('DELETE FROM boletos WHERE order_id = ?');
          const insertStmt = db.prepare(`
            INSERT INTO boletos (id, supplierName, order_id, due_date, value, status, invoice_number)
            VALUES (@id, @supplierName, @order_id, @due_date, @value, @status, @invoice_number)
          `);

          deleteStmt.run(id);
          installmentsList.forEach((inst, index) => {
            insertStmt.run({
              id: `${id}-boleto-${index + 1}`,
              supplierName: order.distributor || null,
              order_id: id,
              due_date: inst.dueDate,
              value: parseFloat(inst.value),
              status: 'Pendente',
              invoice_number: order.invoiceNumber || null
            });
          });
          console.log(`[ORDERS] ${installmentsList.length} boletos sincronizados para o pedido ${id}`);
        } else {
          // Se mudou a forma de pagamento ou virou Foguete Amarelo, remove os boletos antigos associados
          const deleteStmt = db.prepare('DELETE FROM boletos WHERE order_id = ?');
          deleteStmt.run(id);
          console.log(`[ORDERS] Boletos removidos para o pedido ${id} pois a forma de pagamento mudou`);
        }
      }
    })();

    if (result.changes > 0) {
      console.log('[ORDERS] Pedido atualizado com sucesso:', id);
      res.status(200).json({ message: 'Order updated successfully.' });
    } else {
      console.warn('[ORDERS] Pedido não encontrado para atualização:', id);
      res.status(404).json({ error: 'Order not found.' });
    }
  } catch (err) {
    console.error('[ORDERS] Erro ao atualizar pedido:', id, err);
    res.status(500).json({ error: 'Failed to update order.', details: err.message });
  }
});

// DELETE Order
app.delete('/api/orders/:id', (req, res) => {
  try {
    const { id } = req.params;
    let result;
    db.transaction(() => {
      db.prepare('DELETE FROM boletos WHERE order_id = ?').run(id);
      result = db.prepare('DELETE FROM orders WHERE id = ?').run(id);
    })();
    
    if (result.changes > 0) {
      res.status(200).json({ message: 'Order and associated boletos deleted successfully.' });
    } else {
      res.status(404).json({ error: 'Order not found.' });
    }
  } catch (err) {
    console.error('Error deleting order:', err);
    res.status(500).json({ error: 'Failed to delete order.' });
  }
});

// --- Shortages CUD ---
// CREATE Shortage
app.post('/api/shortages', (req, res) => {
  try {
    const shortage = req.body;
    const stmt = db.prepare(`
      INSERT INTO shortages (id, productName, type, clientInquiry, notes, createdAt, userName, purchased, ordered)
      VALUES (@id, @productName, @type, @clientInquiry, @notes, @createdAt, @userName, @purchased, @ordered)
    `);
    const result = stmt.run({
      ...shortage,
      clientInquiry: shortage.clientInquiry ? 1 : 0, // Convert boolean to integer
      purchased: shortage.purchased ? 1 : 0,
      ordered: shortage.ordered ? 1 : 0,
    });
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error('Error creating shortage:', err);
    res.status(500).json({ error: 'Failed to create shortage.' });
  }
});

// UPDATE Shortage
app.put('/api/shortages/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { purchased, ordered } = req.body;
    const stmt = db.prepare(`
      UPDATE shortages 
      SET purchased = ?, ordered = ?
      WHERE id = ?
    `);
    const result = stmt.run(
      purchased ? 1 : 0,
      ordered ? 1 : 0,
      id
    );
    if (result.changes > 0) {
      res.status(200).json({ message: 'Shortage status updated successfully.' });
    } else {
      res.status(404).json({ error: 'Shortage not found.' });
    }
  } catch (err) {
    console.error('Error updating shortage:', err);
    res.status(500).json({ error: 'Failed to update shortage.' });
  }
});

// DELETE Shortage
app.delete('/api/shortages/:id', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM shortages WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes > 0) {
      res.status(200).json({ message: 'Shortage deleted successfully.' });
    } else {
      res.status(404).json({ error: 'Shortage not found.' });
    }
  } catch (err) {
    console.error('Error deleting shortage:', err);
    res.status(500).json({ error: 'Failed to delete shortage.' });
  }
});

// GET search products in Digifarma (used for autocomplete suggestions)
app.get('/api/products/search', async (req, res) => {
  try {
    const q = req.query.q ? req.query.q.toString().toUpperCase().trim() : '';
    if (!q || q.length < 3) {
      return res.json([]);
    }

    // Split search terms to support multi-word search
    const parts = q.split(/\s+/).filter(Boolean);
    let whereClause = "1=1";
    const sqlParams = [];
    
    if (parts.length > 0) {
      whereClause = parts.map(() => "(p.PRODUTO LIKE ? OR p.COD_BARRAS = ?)").join(" AND ");
      parts.forEach(part => {
        sqlParams.push(`%${part}%`, part);
      });
    }

    const sql = `
      SELECT FIRST 10 
        p.PRODUTO_ID, 
        p.PRODUTO, 
        p.APRESENTACAO, 
        p.PROD_SALDO, 
        COALESCE(p.PROD_PRCOMPRA, p.VALOR_ULT_COMPRA, 0) as PROD_PRCOMPRA,
        c.CATEGORIA as CATEGORIA_NOME
      FROM PRODUTOS p
      LEFT JOIN CATEGORIA c ON p.CATEGORIA_ID = c.CATEGORIA_ID
      WHERE ${whereClause}
    `;

    const results = await queryDigifarma(sql, sqlParams);
    
    const products = (results || []).map(r => ({
      id: r.PRODUTO_ID,
      name: r.PRODUTO ? r.PRODUTO.trim() : '',
      presentation: r.APRESENTACAO ? r.APRESENTACAO.trim() : '',
      saldo: r.PROD_SALDO || 0,
      priceCompra: r.PROD_PRCOMPRA || 0,
      categoryName: r.CATEGORIA_NOME ? r.CATEGORIA_NOME.trim() : ''
    }));
    
    res.json(products);
  } catch (err) {
    console.error('Error searching products in Digifarma:', err);
    if (err.message && err.message.includes('Offline')) {
      return res.status(503).json({ error: 'O servidor do Digifarma está Offline.' });
    }
    res.status(500).json({ error: 'Erro ao buscar produtos no Digifarma.' });
  }
});

// POST query Digifarma stock and price for a batch of product names
app.post('/api/shortages/db-status', async (req, res) => {
  try {
    const { productNames } = req.body;
    if (!productNames || !Array.isArray(productNames) || productNames.length === 0) {
      return res.json({});
    }

    const cleanedNames = productNames
      .map(name => name.trim().toUpperCase())
      .filter(Boolean);

    if (cleanedNames.length === 0) {
      return res.json({});
    }

    // Process in batches of 40 to avoid Firebird limits (SQL length, max table contexts)
    const batchSize = 40;
    const batches = [];
    for (let i = 0; i < cleanedNames.length; i += batchSize) {
      batches.push(cleanedNames.slice(i, i + batchSize));
    }

    let results = [];
    for (const batch of batches) {
      const subqueries = batch.map(() => `
        SELECT p.PRODUTO, p.PROD_SALDO, COALESCE(p.PROD_PRCOMPRA, p.VALOR_ULT_COMPRA, 0) as PROD_PRCOMPRA
        FROM PRODUTOS p
        WHERE p.PRODUTO = ?
      `);
      const sql = subqueries.join('\n      UNION ALL\n');
      const batchResults = await queryDigifarma(sql, batch);
      if (batchResults && Array.isArray(batchResults)) {
        results = results.concat(batchResults);
      }
    }
    
    const mapping = {};
    if (results) {
      results.forEach(r => {
        const key = r.PRODUTO ? r.PRODUTO.trim().toUpperCase() : '';
        if (key) {
          mapping[key] = {
            saldo: r.PROD_SALDO || 0,
            priceCompra: r.PROD_PRCOMPRA || 0
          };
        }
      });
    }

    res.json(mapping);
  } catch (err) {
    console.error('Error querying shortage statuses in Digifarma:', err);
    if (err.message && err.message.includes('Offline')) {
      return res.status(503).json({ error: 'O servidor do Digifarma está Offline.' });
    }
    res.status(500).json({ error: 'Erro ao buscar status no Digifarma.' });
  }
});

// FORÇAR VARREDURA DE FALTAS WHATSAPP
app.post('/api/whatsapp/force-shortage-scan', async (req, res) => {
  try {
    const { executarVarreduraWhatsApp } = require('./services/whatsapp-shortage.service.js');
    const options = {
      initialScan30Days: req.body.initialScan30Days === true,
      phone: req.body.phone || null,
      isManual: true
    };
    
    console.log(`[WhatsAppShortage] 🤖 Varredura forçada via API pelo usuário. Opções:`, options);
    
    const result = await executarVarreduraWhatsApp(db, options);
    
    if (result.success) {
      res.status(200).json({ success: true, stats: result.stats });
    } else {
      res.status(500).json({ success: false, error: result.error, stats: result.stats });
    }
  } catch (err) {
    console.error('[WhatsAppShortage] Erro ao forçar varredura:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- Users CUD ---
// CREATE User
app.post('/api/users', (req, res) => {
  try {
    const user = req.body;
    const stmt = db.prepare(`
      INSERT INTO users (id, name, role, accessKey)
      VALUES (@id, @name, @role, @accessKey)
    `);
    const result = stmt.run(user);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Access key already in use.' });
    }
    console.error('Error creating user:', err);
    res.status(500).json({ error: 'Failed to create user.' });
  }
});

// DELETE User
app.delete('/api/users/:id', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes > 0) {
      res.status(200).json({ message: 'User deleted successfully.' });
    } else {
      res.status(404).json({ error: 'User not found.' });
    }
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

// --- Boletos CUD ---
// GET all boletos (incluindo títulos Foguete Amarelo)
app.get('/api/boletos', (req, res) => {
  try {
    // 1. Buscar boletos normais da tabela boletos
    const boletosNormais = db.prepare('SELECT * FROM boletos ORDER BY due_date').all();
    
    // 2. Buscar títulos do Foguete Amarelo da tabela accounts_payable
    // Somente incluir títulos que não estão quitados (status != 'Quitado')
    const boletosFogueteAmarelo = db.prepare(`
      SELECT 
        id,
        supplier_name as supplierName,
        description as invoice_number,
        due_date,
        remaining_value as value,
        CASE 
          WHEN status = 'Quitado' THEN 'Pago'
          WHEN status = 'Pendente' AND julianday(due_date) < julianday('now') THEN 'Vencido'
          ELSE 'Pendente'
        END as status,
        reference_id as order_id
      FROM accounts_payable
      WHERE is_foguete_amarelo = 1
    `).all();
    
    // 3. Combinar os dois arrays
    const todosBoletos = [...boletosNormais, ...boletosFogueteAmarelo];
    
    // 4. Ordenar por data de vencimento
    todosBoletos.sort((a, b) => {
      const dateA = new Date(a.due_date);
      const dateB = new Date(b.due_date);
      return dateA - dateB;
    });
    
    console.log(`[BOLETOS] Retornando ${boletosNormais.length} boletos normais + ${boletosFogueteAmarelo.length} boletos Foguete Amarelo = ${todosBoletos.length} total`);
    
    res.json(todosBoletos);
  } catch (err) {
    console.error('Error fetching boletos:', err);
    res.status(500).json({ error: 'Failed to fetch boletos.' });
  }
});

// CREATE/UPDATE boletos for an order
app.post('/api/orders/:order_id/boletos', (req, res) => {
  const { order_id } = req.params;
  const boletos = req.body; // Expects an array of boleto objects

  const deleteStmt = db.prepare('DELETE FROM boletos WHERE order_id = ?');
  const insertStmt = db.prepare(`
    INSERT INTO boletos (id, supplierName, order_id, due_date, value, status, invoice_number)
    VALUES (@id, @supplierName, @order_id, @due_date, @value, @status, @invoice_number)
  `);
  const updateOrderStmt = db.prepare('UPDATE orders SET installments = ? WHERE id = ?');

  try {
    // Buscar o fornecedor (distributor) do pedido correspondente
    const order = db.prepare('SELECT distributor FROM orders WHERE id = ?').get(order_id);
    const supplierName = order ? order.distributor : null;

    // Converter os boletos para o formato de installments do pedido
    const newInstallments = boletos.map((b, index) => ({
      id: b.id ? b.id.replace(`${order_id}-boleto-`, '') : Math.random().toString(36).substr(2, 5),
      value: parseFloat(b.value),
      dueDate: b.due_date
    }));

    db.transaction(() => {
      // 1. Atualizar os boletos
      deleteStmt.run(order_id);
      for (const boleto of boletos) {
        insertStmt.run({
          id: boleto.id,
          supplierName: supplierName,
          order_id: order_id,
          due_date: boleto.due_date,
          value: parseFloat(boleto.value),
          status: boleto.status,
          invoice_number: boleto.invoice_number || null
        });
      }

      // 2. Atualizar as parcelas no pedido
      updateOrderStmt.run(JSON.stringify(newInstallments), order_id);
    })();
    res.status(201).json({ message: 'Boletos created/updated successfully.' });
  } catch (err) {
    console.error('Error creating/updating boletos:', err);
    res.status(500).json({ error: 'Failed to create/update boletos.' });
  }
});

// CREATE a new boleto
app.post('/api/boletos', (req, res) => {
  try {
    const boleto = req.body;
    const stmt = db.prepare(`
      INSERT INTO boletos (id, supplierName, order_id, due_date, value, status, invoice_number)
      VALUES (@id, @supplierName, @order_id, @due_date, @value, @status, @invoice_number)
    `);
    const result = stmt.run({
      id: boleto.id || null,
      supplierName: boleto.supplierName || null,
      order_id: boleto.order_id || null,
      due_date: boleto.due_date || null,
      value: boleto.value !== undefined ? parseFloat(boleto.value) : null,
      status: boleto.status || null,
      invoice_number: boleto.invoice_number || null
    });
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error('Error creating boleto:', err);
    res.status(500).json({ error: 'Failed to create boleto.', details: err.message });
  }
});

// UPDATE a boleto
app.put('/api/boletos/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { supplierName, order_id, due_date, value, status, invoice_number } = req.body;
    
    if (!supplierName || !due_date || !value || !status) {
        return res.status(400).json({ error: 'Missing required fields for boleto update.' });
    }

    const stmt = db.prepare(`
      UPDATE boletos 
      SET 
        supplierName = @supplierName,
        order_id = @order_id,
        due_date = @due_date,
        value = @value,
        status = @status,
        invoice_number = @invoice_number
      WHERE id = @id
    `);
    
    const result = stmt.run({
      id,
      supplierName,
      order_id: order_id || null,
      due_date,
      value: parseFloat(value),
      status,
      invoice_number: invoice_number || null
    });

    if (result.changes > 0) {
      res.status(200).json({ message: 'Boleto updated successfully.' });
    } else {
      res.status(404).json({ error: 'Boleto not found or no changes made.' });
    }
  } catch (err) {
    console.error('Error updating boleto:', err);
    res.status(500).json({ error: 'Failed to update boleto.', details: err.message });
  }
});

// UPDATE boleto status
app.put('/api/boletos/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const stmt = db.prepare('UPDATE boletos SET status = ? WHERE id = ?');
    const result = stmt.run(status, id);
    if (result.changes > 0) {
      res.status(200).json({ message: 'Boleto status updated successfully.' });
    } else {
      res.status(404).json({ error: 'Boleto not found.' });
    }
  } catch (err) {
    console.error('Error updating boleto status:', err);
    res.status(500).json({ error: 'Failed to update boleto status.' });
  }
});

// DELETE a boleto
app.delete('/api/boletos/:id', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM boletos WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes > 0) {
      res.status(200).json({ message: 'Boleto deleted successfully.' });
    } else {
      res.status(404).json({ error: 'Boleto not found.' });
    }
  } catch (err) {
    console.error('Error deleting boleto:', err);
    res.status(500).json({ error: 'Failed to delete boleto.' });
  }
});

// --- Daily Records CUD ---
app.get('/api/daily-records', (req, res) => {
  try {
    const records = db.prepare('SELECT * FROM daily_records ORDER BY date DESC').all().map(record => ({
      ...record,
      expenses: safelyParseJSON(record.expenses),
      nonRegistered: safelyParseJSON(record.nonRegistered),
      pixDiretoList: safelyParseJSON(record.pixDiretoList),
      crediarioList: safelyParseJSON(record.crediarioList),
      creditReceipts: safelyParseJSON(record.creditReceipts),
      sangrias: safelyParseJSON(record.sangrias), // Parse sangrias
      lancado: !!record.lancado, // Convert 0/1 to boolean
    }));
    res.json(records);
  } catch (err) {
    console.error('Error fetching daily records:', err);
    res.status(500).json({ error: 'Failed to fetch daily records.' });
  }
});

// Helper function to sync sangrias to safe entries
const syncSangriasToSafe = (sangrias, date, userName, drId) => {
  try {
    const parsedSangrias = Array.isArray(sangrias) ? sangrias : JSON.parse(sangrias || '[]');
    
    db.transaction(() => {
      // 1. Delete sangrias for this record that are NOT in the new list
      const currentIds = parsedSangrias.map(s => s.id).filter(id => !!id);
      
      if (currentIds.length > 0) {
        const placeholders = currentIds.map(() => '?').join(',');
        db.prepare(`
          DELETE FROM safe_entries 
          WHERE parent_id = ? 
          AND description LIKE '[Sangria]%'
          AND source_id NOT IN (${placeholders})
        `).run(drId, ...currentIds);
      } else {
        db.prepare("DELETE FROM safe_entries WHERE parent_id = ? AND description LIKE '[Sangria]%'").run(drId);
      }
      
      // 2. Insert or update the new list
      for (const s of parsedSangrias) {
        if (!s.id || !s.val) continue;

        const existing = db.prepare('SELECT id FROM safe_entries WHERE source_id = ? AND parent_id = ?').get(s.id, drId);
        
        if (existing) {
          db.prepare(`
            UPDATE safe_entries 
            SET value = ?, date = ?, description = ?, userName = ?
            WHERE source_id = ? AND parent_id = ?
          `).run(s.val, date, `[Sangria] ${s.desc}`, userName, s.id, drId);
          console.log(`[SANGRIA SYNC] ✓ Updated safe entry for sangria "${s.desc}" - R$ ${s.val}`);
        } else {
          db.prepare(`
            INSERT INTO safe_entries (id, date, description, type, value, userName, source_id, parent_id)
            VALUES (?, ?, ?, 'Entrada', ?, ?, ?, ?)
          `).run('S' + s.id, date, `[Sangria] ${s.desc}`, s.val, userName, s.id, drId);
          console.log(`[SANGRIA SYNC] ✓ Created safe entry for sangria "${s.desc}" - R$ ${s.val}`);
        }
      }
    })();
  } catch (err) {
    console.error('[SANGRIA SYNC] ✗ Error syncing sangrias to safe:', err.message);
    console.error('[SANGRIA SYNC] Parameters:', { sangrias: JSON.stringify(sangrias), date, userName, drId });
  }
};

app.post('/api/daily-records', (req, res) => {
  try {
    const record = req.body;
    const stmt = db.prepare(`
      INSERT INTO daily_records (id, date, expenses, nonRegistered, pixDiretoList, crediarioList, creditReceipts, sangrias, userName, lancado)
      VALUES (@id, @date, @expenses, @nonRegistered, @pixDiretoList, @crediarioList, @creditReceipts, @sangrias, @userName, 0)
    `);
    stmt.run({
      ...record,
      expenses: JSON.stringify(record.expenses || []),
      nonRegistered: JSON.stringify(record.nonRegistered || []),
      pixDiretoList: JSON.stringify(record.pixDiretoList || []),
      crediarioList: JSON.stringify(record.crediarioList || []),
      creditReceipts: JSON.stringify(record.creditReceipts || []),
      sangrias: JSON.stringify(record.sangrias || []),
    });
    
    // Sync sangrias to safe
    if (record.sangrias) {
      syncSangriasToSafe(record.sangrias, record.date, record.userName, record.id);
    }

    res.status(201).json({ id: record.id || Date.now().toString() });
  } catch (err) {
    console.error('Error creating daily record:', err);
    res.status(500).json({ error: 'Failed to create daily record.' });
  }
});

app.post('/api/daily-records/pix-direct', (req, res) => {
  try {
    const { value, desc, userName } = req.body;
    if (!value || isNaN(value)) {
      return res.status(400).json({ error: 'Value is required and must be a number.' });
    }
    const today = new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());

    const PixBotService = require('./services/pix-bot.service');
    const pixBot = new PixBotService(db);
    pixBot.recordPixDirect(value, desc || 'Venda Gerador Pix', today);

    // Registra auditoria
    const logId = Math.random().toString(36).substr(2, 9);
    db.prepare(`
      INSERT INTO logs (id, timestamp, userName, userId, action, category, details)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      logId, 
      new Date().toISOString(), 
      userName || 'Operador', 
      'pix-generator', 
      'Lançou Pix Direto', 
      'Financeiro', 
      `Valor: R$ ${value}, Descrição: ${desc || 'Venda Gerador Pix'}`
    );

    res.status(200).json({ success: true, message: 'Pix Direct registered successfully.' });
  } catch (err) {
    console.error('Error recording Pix Direct:', err);
    res.status(500).json({ error: 'Failed to record Pix Direct.', details: err.message });
  }
});

// ==========================================
// BANCO INTER PIX DINÂMICO - ROTAS DE API
// ==========================================

// 1. GERAR COBRANÇA PIX DINÂMICA
app.post('/api/pix/generate-dynamic', async (req, res) => {
  try {
    const { value, description } = req.body;
    if (!value || isNaN(value) || parseFloat(value) <= 0) {
      return res.status(400).json({ error: 'Value must be a positive number.' });
    }

    const charge = await interPixService.createPixCharge(value, description);
    
    // Salva na tabela local pix_confirmations como 'Pendente' para conciliação mútua
    db.prepare(`
      INSERT OR REPLACE INTO pix_confirmations (id, phone, value, senderName, pixDate, status, aiAnalysis, createdAt, type, userName)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      charge.txid,
      'balcao',
      charge.value,
      charge.description || 'Venda Balcão Banco Inter PJ',
      new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
      'Pendente',
      'Pix Dinâmico Banco Inter',
      new Date().toISOString(),
      'entrada',
      req.body.userName || 'Caixa'
    );

    res.status(200).json(charge);
  } catch (err) {
    console.error('Error generating dynamic Pix:', err);
    res.status(500).json({ error: 'Failed to generate Pix charge.', details: err.message });
  }
});

// 2. CONSULTAR STATUS DA COBRANÇA (POLLING E FAIL-SAFE)
app.get('/api/pix/status/:txid', async (req, res) => {
  try {
    const { txid } = req.params;
    console.log(`[PIX STATUS] Consultando status do txid: ${txid}`);
    const status = await interPixService.getChargeStatus(txid);
    console.log(`[PIX STATUS] Status retornado pela API Inter: ${status}`);
    
    // Se estiver paga/concluída nas APIs, garante que está lançada localmente de forma idempotente
    if (status === 'CONCLUIDA' || status === 'CONCLUIDO') {
      const localRecord = db.prepare('SELECT status, value, senderName FROM pix_confirmations WHERE id = ?').get(txid);
      console.log(`[PIX STATUS] Registro local encontrado:`, localRecord);
      
      if (localRecord && localRecord.status === 'Pendente') {
        console.log(`[PIX LANÇAMENTO] ✅ Pix PAGO detectado. Txid: ${txid}. Valor: R$ ${localRecord.value}. Lançando no caixa...`);
        
        // 1. Confirma o pagamento no banco local
        db.prepare("UPDATE pix_confirmations SET status = 'Confirmado' WHERE id = ?").run(txid);
        
        // 2. Lança no caixa diário
        const today = new Intl.DateTimeFormat('fr-CA', {
          timeZone: 'America/Sao_Paulo',
          year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(new Date());

        try {
          const PixBotService = require('./services/pix-bot.service');
          const pixBot = new PixBotService(db);
          pixBot.recordPixDirect(localRecord.value, localRecord.senderName || 'Venda Balcão Banco Inter PJ', today);
          console.log(`[PIX LANÇAMENTO] ✅ Valor R$ ${localRecord.value} lançado com sucesso no caixa diário de ${today}`);
        } catch (launchErr) {
          console.error(`[PIX LANÇAMENTO] ❌ ERRO ao lançar no caixa diário:`, launchErr.message);
        }
      } else if (localRecord && localRecord.status === 'Confirmado') {
        console.log(`[PIX STATUS] Txid ${txid} já foi confirmado e lançado anteriormente. Ignorando.`);
      }
    }

    res.status(200).json({ status });
  } catch (err) {
    console.error(`[PIX STATUS] Erro ao consultar txid ${req.params.txid}:`, err);
    res.status(500).json({ error: 'Failed to fetch status.' });
  }
});

// 3. SIMULAR PAGAMENTO DE PIX (Apenas em modo de teste/simulado)
app.post('/api/pix/mock-pay/:txid', (req, res) => {
  try {
    const { txid } = req.params;
    const success = interPixService.simulatePayment(txid);
    
    if (success) {
      // Confirma localmente
      db.prepare("UPDATE pix_confirmations SET status = 'Confirmado' WHERE id = ?").run(txid);
      res.status(200).json({ success: true, message: 'Simulated payment processed and recorded in cash closing.' });
    } else {
      res.status(400).json({ error: 'Charge not found or already paid.' });
    }
  } catch (err) {
    console.error('Error processing mock payment:', err);
    res.status(500).json({ error: 'Failed to process mock payment.' });
  }
});

// EXTRATO: Listar histórico de Pix (entradas e retiradas)
app.get('/api/pix/history', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate || new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const end = endDate || start;

    const records = db.prepare(`
      SELECT id, phone, value, senderName, pixDate, status, aiAnalysis, createdAt, 
             COALESCE(type, 'entrada') as type, COALESCE(userName, '') as userName
      FROM pix_confirmations 
      WHERE pixDate >= ? AND pixDate <= ?
      ORDER BY createdAt DESC
    `).all(start, end);

    // Calcula totais
    const totalEntradas = records
      .filter(r => (r.type === 'entrada') && r.status === 'Confirmado')
      .reduce((sum, r) => sum + (r.value || 0), 0);
    const totalRetiradas = records
      .filter(r => r.type === 'retirada')
      .reduce((sum, r) => sum + (r.value || 0), 0);

    res.json({
      records,
      totalEntradas: Number(totalEntradas.toFixed(2)),
      totalRetiradas: Number(totalRetiradas.toFixed(2)),
      saldo: Number((totalEntradas - totalRetiradas).toFixed(2))
    });
  } catch (err) {
    console.error('[PIX HISTORY] Erro ao buscar histórico:', err);
    res.status(500).json({ error: 'Erro ao buscar histórico de Pix.' });
  }
});

// RETIRADA: Registrar uma retirada de Pix
app.post('/api/pix/withdrawal', (req, res) => {
  try {
    const { value, description, userName } = req.body;
    if (!value || isNaN(value) || parseFloat(value) <= 0) {
      return res.status(400).json({ error: 'Valor inválido.' });
    }

    const id = 'retirada_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
    const today = new Intl.DateTimeFormat('fr-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());

    db.prepare(`
      INSERT INTO pix_confirmations (id, phone, value, senderName, pixDate, status, aiAnalysis, createdAt, type, userName)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      'balcao',
      parseFloat(value),
      description || 'Retirada de Pix',
      today,
      'Confirmado',
      'Retirada manual via Gerador Pix',
      new Date().toISOString(),
      'retirada',
      userName || 'Sistema'
    );

    console.log(`[PIX RETIRADA] R$ ${parseFloat(value).toFixed(2)} registrada por ${userName}. Desc: ${description}`);
    res.json({ success: true, id });
  } catch (err) {
    console.error('[PIX RETIRADA] Erro:', err);
    res.status(500).json({ error: 'Erro ao registrar retirada.' });
  }
});

// 4. WEBHOOK OFICIAL DO BANCO INTER (Para conciliação automática de produção)
app.post('/api/webhook/inter-pix', (req, res) => {
  try {
    const payments = req.body;
    console.log('[BANCO INTER WEBHOOK] 📥 Recebido evento de pagamento:', JSON.stringify(payments));
    
    if (Array.isArray(payments)) {
      for (const event of payments) {
        if (event.pix && Array.isArray(event.pix)) {
          for (const item of event.pix) {
            const { txid, valor } = item;
            if (txid) {
              const localRecord = db.prepare('SELECT status, value, senderName FROM pix_confirmations WHERE id = ?').get(txid);
              if (localRecord && localRecord.status === 'Pendente') {
                console.log(`[BANCO INTER WEBHOOK] ✓ Confirmando pagamento do txid: ${txid} - R$ ${valor}`);
                
                db.prepare("UPDATE pix_confirmations SET status = 'Confirmado' WHERE id = ?").run(txid);
                
                const today = new Intl.DateTimeFormat('fr-CA', {
                  timeZone: 'America/Sao_Paulo',
                  year: 'numeric', month: '2-digit', day: '2-digit'
                }).format(new Date());

                const PixBotService = require('./services/pix-bot.service');
                const pixBot = new PixBotService(db);
                pixBot.recordPixDirect(localRecord.value, localRecord.senderName || 'Venda Balcão Banco Inter PJ', today);
              }
            }
          }
        }
      }
    }
    
    res.status(200).send('OK');
  } catch (err) {
    console.error('[BANCO INTER WEBHOOK] Erro ao processar:', err.message);
    res.status(550).send('Error'); // Código padrão do Inter para rejeitar
  }
});

// IMPORTANT: Specific routes must come before parameterized routes!
// This must be BEFORE app.put('/api/daily-records/:id') to avoid route conflicts
app.put('/api/daily-records/mark-processed', (req, res) => {
  try {
    const { recordIds, cashClosingId } = req.body;
    console.log('=== Mark Daily Records as Processed ===');
    console.log('Record IDs to mark:', recordIds);
    
    if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({ error: 'recordIds is required and must be a non-empty array.' });
    }

    const placeholders = recordIds.map(() => '?').join(',');
    const stmt = db.prepare(`
      UPDATE daily_records 
      SET lancado = 1, cashClosingId = ?
      WHERE id IN (${placeholders})
    `);
    
    const result = stmt.run(cashClosingId || null, ...recordIds);

    console.log('Records updated:', result.changes);
    
    // Verify the update
    const verifyStmt = db.prepare(`SELECT id, lancado FROM daily_records WHERE id IN (${recordIds.map(() => '?').join(',')})`);
    const updatedRecords = verifyStmt.all(...recordIds);
    console.log('Updated records verification:', updatedRecords);

    res.status(200).json({ message: `${result.changes} daily records marked as processed.` });
  } catch (err) {
    console.error('Error marking daily records as processed:', err);
    res.status(500).json({ error: 'Failed to mark daily records as processed.' });
  }
});

app.put('/api/daily-records/:id', (req, res) => {
  try {
    const { id } = req.params;
    const record = req.body;
    const stmt = db.prepare(`
      UPDATE daily_records 
      SET expenses = @expenses, 
          nonRegistered = @nonRegistered, 
          pixDiretoList = @pixDiretoList, 
          crediarioList = @crediarioList,
          creditReceipts = @creditReceipts,
          sangrias = @sangrias,
          date = @date
      WHERE id = @id AND lancado = 0
    `);
    const result = stmt.run({
      ...record,
      id,
      expenses: JSON.stringify(record.expenses || []),
      nonRegistered: JSON.stringify(record.nonRegistered || []),
      pixDiretoList: JSON.stringify(record.pixDiretoList || []),
      crediarioList: JSON.stringify(record.crediarioList || []),
      creditReceipts: JSON.stringify(record.creditReceipts || []),
      sangrias: JSON.stringify(record.sangrias || []),
    });
    
    if (result.changes > 0) {
      // Sync sangrias to safe
      syncSangriasToSafe(record.sangrias || [], record.date, record.userName, id);
      res.status(200).json({ message: 'Daily record updated successfully.' });
    } else {
      res.status(404).json({ error: 'Daily record not found or already processed.' });
    }
  } catch (err) {
    console.error('Error updating daily record:', err);
    res.status(500).json({ error: 'Failed to update daily record.' });
  }
});

app.delete('/api/daily-records/:id', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM daily_records WHERE id = ? AND lancado = 0');
    const result = stmt.run(id);
    if (result.changes > 0) {
      res.status(200).json({ message: 'Daily record deleted successfully.' });
    } else {
      res.status(404).json({ error: 'Daily record not found or already processed.' });
    }
  } catch (err) {
    console.error('Error deleting daily record:', err);
    res.status(500).json({ error: 'Failed to delete daily record.' });
  }
});


// --- Logs CUD ---
// CREATE Log
app.post('/api/logs', (req, res) => {
  try {
    const log = req.body;
    const stmt = db.prepare(`
      INSERT INTO logs (id, timestamp, userName, userId, action, category, details)
      VALUES (@id, @timestamp, @userName, @userId, @action, @category, @details)
    `);
    const result = stmt.run(log);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error('Error creating log:', err);
    res.status(500).json({ error: 'Failed to create log.' });
  }
});

// --- Cash Closings CUD ---
// GET all cash closings
app.get('/api/cash-closings', (req, res) => {
  try {
    const closings = db.prepare('SELECT * FROM cash_closings ORDER BY date DESC').all().map(closing => ({
      ...closing,
      crediarioList: safelyParseJSON(closing.crediarioList),
      creditReceipts: safelyParseJSON(closing.creditReceipts)
    }));
    res.json(closings);
  } catch (err) {
    console.error('Error fetching cash closings:', err);
    console.error(err.stack);
    res.status(500).json({ error: 'Failed to fetch cash closings.', details: err.message });
  }
});

// CREATE cash closing
app.post('/api/cash-closings', (req, res) => {
  try {
    const closing = req.body;
    console.log('Received closing data:', closing); // Debugging line
    const insertClosingStmt = db.prepare(`
      INSERT INTO cash_closings (id, date, totalSales, initialCash, receivedExtra, totalDigital, totalInDrawer, difference, safeDeposit, expenses, userName, credit, debit, pix, pixDirect, totalCrediario, crediarioList, creditReceipts)
      VALUES (@id, @date, @totalSales, @initialCash, @receivedExtra, @totalDigital, @totalInDrawer, @difference, @safeDeposit, @expenses, @userName, @credit, @debit, @pix, @pixDirect, @totalCrediario, @crediarioList, @creditReceipts)
    `);
    
    const insertTransactionStmt = db.prepare(`
      INSERT INTO checking_account_transactions (id, date, description, type, value, cashClosingId)
      VALUES (@id, @date, @description, @type, @value, @cashClosingId)
    `);

    const insertSafeEntryStmt = db.prepare(`
      INSERT INTO safe_entries (id, date, description, type, value, userName, source_id)
      VALUES (@id, @date, @description, @type, @value, @userName, @source_id)
    `);

    db.transaction(() => {
      insertClosingStmt.run({
        ...closing,
        crediarioList: JSON.stringify(closing.crediarioList || []),
        creditReceipts: JSON.stringify(closing.creditReceipts || [])
      });

      const transactionDate = new Date().toISOString();
      
      // If there is a safe deposit, record it in the safe
      const safeDepositVal = Number(closing.safeDeposit);
      console.log(`[CASH CLOSING DEBUG] safeDeposit raw: ${closing.safeDeposit}, parsed: ${safeDepositVal}`);

      if (safeDepositVal > 0) {
        console.log(`[CASH CLOSING] Registering safe deposit: R$ ${safeDepositVal}`);
        insertSafeEntryStmt.run({
          id: 'S' + Date.now().toString(),
          date: transactionDate,
          description: `Depósito Fechamento de Caixa`,
          type: 'Entrada',
          value: safeDepositVal,
          userName: closing.userName,
          source_id: null
        });
      }

      if (closing.credit > 0) {
        insertTransactionStmt.run({
          id: `txn_credit_${closing.id}`,
          date: transactionDate,
          description: 'Cartão de Crédito',
          type: 'Entrada',
          value: closing.credit,
          cashClosingId: closing.id
        });
      }
      if (closing.debit > 0) {
        insertTransactionStmt.run({
          id: `txn_debit_${closing.id}`,
          date: transactionDate,
          description: 'Cartão de Débito',
          type: 'Entrada',
          value: closing.debit,
          cashClosingId: closing.id
        });
      }
      if (closing.pix > 0) {
        insertTransactionStmt.run({
          id: `txn_pix_${closing.id}`,
          date: transactionDate,
          description: 'Pix (Maquininha)',
          type: 'Entrada',
          value: closing.pix,
          cashClosingId: closing.id
        });
      }
      if (closing.pixDirect > 0) {
        insertTransactionStmt.run({
          id: `txn_pix_direct_${closing.id}`,
          date: transactionDate,
          description: 'Pix Direto na Conta',
          type: 'Entrada',
          value: closing.pixDirect,
          cashClosingId: closing.id
        });
      }
    })();

    // Auto-create task if accumulated safe deposits >= R$ 1000
    if (closing.safeDeposit > 0) {
      console.log(`[CASH CLOSING] Safe deposit: R$ ${closing.safeDeposit.toFixed(2)}`);
      
      try {
        // Calculate current safe balance (Entradas - Saídas)
        const balanceResult = db.prepare(`
          SELECT 
            SUM(CASE WHEN type = 'Entrada' THEN value ELSE 0 END) - 
            SUM(CASE WHEN type = 'Saída' THEN value ELSE 0 END) as balance
          FROM safe_entries
        `).get();
        
        const currentSafeBalance = balanceResult?.balance || 0;
        console.log(`[TASK AUTO] Current safe balance: R$ ${currentSafeBalance.toFixed(2)}`);
        
        if (currentSafeBalance >= 1000) {
          console.log('[TASK AUTO] Total >= 1000. Checking if task already exists...');
          
          // Check if there's already an open deposit task
          const existingTask = db.prepare(`
            SELECT id FROM tasks 
            WHERE title = 'Realizar Depósito Bancário' 
            AND status != 'Concluída' 
            AND status != 'Cancelada'
            AND isArchived = 0
            LIMIT 1
          `).get();
          
          if (existingTask) {
            console.log('[TASK AUTO] Task already exists. Skipping creation.');
          } else {
            console.log('[TASK AUTO] No existing task found. Creating new task...');
            
            // Get first admin user
            const adminUser = db.prepare("SELECT id FROM users WHERE role = 'Administrador' LIMIT 1").get();
            
            if (adminUser) {
              const taskId = 'task-' + Date.now();
              const now = new Date();
              const tomorrow = new Date(now);
              tomorrow.setDate(tomorrow.getDate() + 1);
              
              const taskStmt = db.prepare(`
                INSERT INTO tasks (
                  id, title, description, assignedUser, creator, priority, status, 
                  dueDate, creationDate, color, isArchived, annotations, 
                  needsAdminAttention, hasAdminResponse
                ) VALUES (
                  @id, @title, @description, @assignedUser, @creator, @priority, @status,
                  @dueDate, @creationDate, @color, @isArchived, @annotations, 
                  @needsAdminAttention, @hasAdminResponse
                )
              `);
              
              taskStmt.run({
                id: taskId,
                title: 'Realizar Depósito Bancário',
                description: `Cofre acumulou R$ ${totalSafeDeposits.toFixed(2)} em depósitos dos fechamentos de caixa. Último depósito: R$ ${closing.safeDeposit.toFixed(2)} por ${closing.userName}. Realizar depósito no banco para segurança.`,
                assignedUser: adminUser.id,
                creator: adminUser.id,
                priority: 'Urgente',
                status: 'A Fazer',
                dueDate: tomorrow.toISOString(),
                creationDate: now.toISOString(),
                color: 'orange',
                isArchived: 0,
                annotations: '[]',
                needsAdminAttention: 0,
                hasAdminResponse: 0
              });
              
              console.log(`[TASK AUTO] ✓ Task ${taskId} created successfully. Total safe deposits: R$ ${totalSafeDeposits.toFixed(2)}`);
            } else {
              console.warn('[TASK AUTO] No admin user found. Task not created.');
            }
          }
        } else {
          console.log(`[TASK AUTO] Total (R$ ${totalSafeDeposits.toFixed(2)}) is below threshold (R$ 1000). No task created.`);
        }
      } catch (taskErr) {
        console.error('[TASK AUTO] ✗ Error in task automation:', taskErr);
        // Continue execution - don't fail the cash closing
      }
    }

    // ── Notificação WhatsApp (best-effort, não bloqueia a resposta) ──────────
    try {
      const waService = require('./services/whatsapp.service');
      waService.notifyCashClosing({
        date: closing.date,
        totalSales: closing.totalSales,
        totalExpenses: closing.expenses || 0,
        safeAmount: closing.safeDeposit || 0,
      }).catch(err => console.warn('[WhatsApp] Falha silenciosa no aviso de caixa:', err.message));
    } catch (waErr) {
      console.warn('[WhatsApp] Serviço indisponível:', waErr.message);
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── Verificação Automática de Faltas (Stock <= 1) ──────────
    try {
      (async () => {
        try {
          console.log('[AUTO-SHORTAGES] Verificando produtos vendidos hoje com estoque <= 1...');
          const sqlFaltas = `
            SELECT DISTINCT p.PRODUTO_ID, p.PRODUTO as PROD_NOME, p.PROD_SALDO
            FROM ITEM_VENDAS iv
            JOIN CAB_VENDAS v ON iv.VENDA_NOTA_ID = v.VENDA_NOTA_ID
            JOIN PRODUTOS p ON iv.PRODUTO_ID = p.PRODUTO_ID
            WHERE v.CANCELADO <> 'S'
              AND v.VENDA_DATA_HORA >= CURRENT_DATE
              AND p.PROD_SALDO <= 1
          `;
          const resultFaltas = await queryDigifarma(sqlFaltas);
          
          if (resultFaltas && resultFaltas.length > 0) {
            console.log(`[AUTO-SHORTAGES] Encontrados ${resultFaltas.length} produtos com saldo <= 1.`);
            const insertShortageStmt = db.prepare(`
              INSERT INTO shortages (id, productName, type, clientInquiry, notes, createdAt, userName, source, purchased, ordered)
              VALUES (@id, @productName, @type, @clientInquiry, @notes, @createdAt, @userName, @source, @purchased, @ordered)
            `);
            
            for (const item of resultFaltas) {
              const prodName = (item.PROD_NOME || '').trim();
              const saldo = item.PROD_SALDO || 0;
              
              const existing = db.prepare(`SELECT id FROM shortages WHERE productName = ? AND purchased = 0 AND ordered = 0 LIMIT 1`).get(prodName);
              
              if (!existing) {
                const notes = saldo === 1 ? '[ATENÇÃO: RESTA 1 NO ESTOQUE]' : '';
                
                let productType = 'Marca (Referência)';
                const nomeLower = prodName.toLowerCase();
                if (nomeLower.includes('generico') || nomeLower.includes('genérico')) {
                  productType = 'Genérico';
                } else if (
                  nomeLower.includes('shampoo') || 
                  nomeLower.includes('condicionador') ||
                  nomeLower.includes('sabonete') ||
                  nomeLower.includes('desodorante') ||
                  nomeLower.includes('fralda') ||
                  nomeLower.includes('creme') ||
                  nomeLower.includes('perfume') ||
                  nomeLower.includes('absorvente') ||
                  nomeLower.includes('escova') ||
                  nomeLower.includes('pasta') ||
                  nomeLower.includes('gillette') ||
                  nomeLower.includes('prestobarba')
                ) {
                  productType = 'Perfumaria';
                }

                insertShortageStmt.run({
                  id: 'sht_' + Date.now().toString() + '_' + Math.floor(Math.random() * 1000),
                  productName: prodName,
                  type: productType,
                  clientInquiry: 0,
                  notes: notes,
                  createdAt: new Date().toISOString(),
                  userName: 'Sistema (Fechamento)',
                  source: 'auto',
                  purchased: 0,
                  ordered: 0
                });
                console.log(`[AUTO-SHORTAGES] Adicionado à lista de faltas: ${prodName} (Saldo: ${saldo})`);
              }
            }
          }
        } catch (e) {
          console.error('[AUTO-SHORTAGES] Erro ao buscar/inserir faltas automáticas:', e);
        }
      })();
    } catch (err) {
      console.warn('[AUTO-SHORTAGES] Falha ao disparar rotina:', err.message);
    }
    // ────────────────────────────────────────────────────────────────────────

    res.status(201).json({ id: closing.id });
  } catch (err) {
    console.error('Error creating cash closing:', err);
    res.status(500).json({ error: 'Failed to create cash closing.', details: err.message });
  }
});

const crediarioService = require('./services/crediario.service');

// GET all crediario records (Open debts from Digifarma)
app.get('/api/crediario', async (req, res) => {
  try {
    const records = await crediarioService.listarCrediarioAtivo();
    res.json(records);
  } catch (err) {
    console.error('Error fetching crediario records from Digifarma:', err);
    if (err.message.includes('Offline')) {
      return res.status(503).json({ error: 'O servidor do Digifarma está Offline.' });
    }
    res.status(500).json({ error: 'Failed to fetch crediario records.' });
  }
});

// POST receive crediario payment
app.post('/api/crediario/receber', async (req, res) => {
  try {
    const { crediarioId, valorPago } = req.body;
    if (!crediarioId || !valorPago) {
      return res.status(400).json({ error: 'Faltam dados para baixa.' });
    }
    const result = await crediarioService.receberCrediario(crediarioId, valorPago);
    res.status(200).json(result);
  } catch (err) {
    console.error('Error receiving crediario in Digifarma:', err);
    if (err.message.includes('Offline')) {
      return res.status(503).json({ error: 'O servidor do Digifarma está Offline.' });
    }
    res.status(500).json({ error: 'Failed to receive crediario.' });
  }
});

// POST send crediario billing message via WhatsApp
app.post('/api/crediario/enviar-cobranca', async (req, res) => {
  try {
    const { phone, messageText } = req.body;
    if (!phone || !messageText) {
      return res.status(400).json({ error: 'Faltam dados para envio (celular ou mensagem).' });
    }

    const messageSender = require('./services/message-sender.service');
    const result = await messageSender.sendMessage(phone, messageText);
    
    if (result.success) {
      res.json({ success: true, message: 'Cobrança enviada com sucesso!' });
    } else {
      res.status(500).json({ error: result.error || 'Erro ao enviar mensagem via WhatsApp.' });
    }
  } catch (err) {
    console.error('Error sending WhatsApp debt alert:', err);
    res.status(500).json({ error: 'Falha interna ao enviar cobrança.' });
  }
});

// --- Critical Stock Endpoints (Tabela critical_products local) ---
// GET all critical products
app.get('/api/stock/critical', async (req, res) => {
  try {
    const products = db.prepare('SELECT * FROM critical_products ORDER BY productName ASC').all();
    res.json(products);
  } catch (err) {
    console.error('Error fetching critical products:', err);
    res.status(500).json({ error: 'Erro ao listar produtos críticos.' });
  }
});

// POST add new critical product
app.post('/api/stock/critical', async (req, res) => {
  try {
    const { produto_id, productName, minStock } = req.body;
    if (!produto_id || !productName) {
      return res.status(400).json({ error: 'ID e nome do produto são obrigatórios.' });
    }

    const id = 'cp_' + Date.now().toString() + '_' + Math.random().toString(36).substring(2, 7);
    const min = minStock !== undefined ? Number(minStock) : 0;

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO critical_products (id, produto_id, productName, minStock)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(id, Number(produto_id), productName.trim(), min);

    res.json({ success: true, product: { id, produto_id, productName, minStock: min } });
  } catch (err) {
    console.error('Error adding critical product:', err);
    res.status(500).json({ error: 'Erro ao adicionar produto crítico.' });
  }
});

// DELETE remove critical product
app.delete('/api/stock/critical/:id', async (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM critical_products WHERE id = ?').run(id);
    res.json({ success: true, message: 'Produto crítico removido do monitoramento.' });
  } catch (err) {
    console.error('Error deleting critical product:', err);
    res.status(500).json({ error: 'Erro ao remover produto crítico.' });
  }
});

// GET/POST check critical products stock against Digifarma database
app.get('/api/stock/critical/check', async (req, res) => {
  try {
    const criticalList = db.prepare('SELECT * FROM critical_products').all();
    if (criticalList.length === 0) {
      return res.json({ alerts: [], checkedCount: 0 });
    }

    // Busca no Digifarma o saldo real dos produtos cadastrados
    const productIds = criticalList.map(p => p.produto_id);
    const sql = `
      SELECT PRODUTO_ID, PRODUTO, PROD_SALDO 
      FROM PRODUTOS 
      WHERE PRODUTO_ID IN (${productIds.join(',')})
    `;
    
    const digiProducts = await queryDigifarma(sql);
    
    const alerts = [];
    for (const cp of criticalList) {
      const dp = (digiProducts || []).find(x => x.PRODUTO_ID === cp.produto_id);
      const currentStock = dp ? dp.PROD_SALDO : 0;
      
      if (currentStock <= cp.minStock) {
        alerts.push({
          id: cp.id,
          produto_id: cp.produto_id,
          productName: cp.productName,
          minStock: cp.minStock,
          currentStock: currentStock,
          isZero: currentStock <= 0
        });
      }
    }

    res.json({
      alerts,
      checkedCount: criticalList.length
    });
  } catch (err) {
    console.error('Error checking critical stock alerts:', err);
    if (err.message.includes('Offline')) {
      return res.status(503).json({ error: 'O servidor do Digifarma está Offline.' });
    }
    res.status(500).json({ error: 'Erro ao verificar alertas de estoque crítico.' });
  }
});

// POST send WhatsApp alert for critical stock to Admin
app.post('/api/stock/critical/notify-admin', async (req, res) => {
  try {
    const { alerts } = req.body;
    if (!alerts || alerts.length === 0) {
      return res.status(400).json({ error: 'Nenhum alerta para enviar.' });
    }

    const messageSender = require('./services/message-sender.service');
    const adminPhone = process.env.ADMIN_WHATSAPP;
    if (!adminPhone) {
      return res.status(400).json({ error: 'Celular do administrador não cadastrado no .env (ADMIN_WHATSAPP).' });
    }

    let msg = `⚠️ *ALERTA DE ESTOQUE CRÍTICO - BELAFARMA*\n\n`;
    msg += `Os seguintes produtos monitorados estão com estoque baixo ou zerado:\n\n`;
    
    alerts.forEach((alt, idx) => {
      msg += `${idx + 1}. *${alt.productName}*\n`;
      msg += `   - Estoque Atual: *${alt.currentStock}*\n`;
      msg += `   - Estoque Mínimo: *${alt.minStock}*\n\n`;
    });
    
    msg += `Por favor, avalie a necessidade de reposição junto aos distribuidores.`;

    const result = await messageSender.sendMessage(adminPhone, msg);
    if (result.success) {
      res.json({ success: true, message: 'Alerta enviado ao administrador!' });
    } else {
      res.status(500).json({ error: result.error || 'Erro ao enviar WhatsApp.' });
    }
  } catch (err) {
    console.error('Error notifying admin about critical stock:', err);
    res.status(500).json({ error: 'Erro ao processar notificação.' });
  }
});

// --- Tasks CUD ---
// CREATE Task
app.post('/api/tasks', (req, res) => {
  const {
    id, title, description, assignedUser, creator, priority, status, dueDate, creationDate, color,
    recurrence, originalDueDate, annotations, needsAdminAttention, adminAttentionMessage
  } = req.body;

  // Basic validation
  if (!id || !title || !assignedUser || !creator || !priority || !status || !dueDate || !creationDate || !color) {
    return res.status(400).json({ error: 'Missing required task fields.' });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO tasks (
        id, title, description, assignedUser, creator, priority, status, dueDate, creationDate, color, 
        isArchived, completionDate, 
        recurrenceType, recurrenceInterval, recurrenceDaysOfWeek, recurrenceDayOfMonth, recurrenceMonthOfYear, recurrenceEndDate, 
        recurrenceId, originalDueDate, annotations, needsAdminAttention, adminAttentionMessage
      )
      VALUES (
        @id, @title, @description, @assignedUser, @creator, @priority, @status, @dueDate, @creationDate, @color, 
        0, NULL,
        @recurrenceType, @recurrenceInterval, @recurrenceDaysOfWeek, @recurrenceDayOfMonth, @recurrenceMonthOfYear, @recurrenceEndDate, 
        @recurrenceId, @originalDueDate, @annotations, @needsAdminAttention, @adminAttentionMessage
      )
    `);

    const result = stmt.run({
      id, title, description, assignedUser, creator, priority, status, dueDate, creationDate, color,
      recurrenceType: recurrence?.type || 'none',
      recurrenceInterval: recurrence?.interval || 0,
      recurrenceDaysOfWeek: recurrence?.daysOfWeek ? JSON.stringify(recurrence.daysOfWeek) : '[]',
      recurrenceDayOfMonth: recurrence?.dayOfMonth || 0,
      recurrenceMonthOfYear: recurrence?.monthOfYear || 0,
      recurrenceEndDate: recurrence?.endDate || null,
      recurrenceId: (recurrence?.type && recurrence.type !== 'none') ? id : null, // If it's a recurring template, its own ID is its recurrenceId
      originalDueDate: originalDueDate || null,
      annotations: annotations ? JSON.stringify(annotations) : '[]',
      needsAdminAttention: needsAdminAttention ? 1 : 0,
      adminAttentionMessage: adminAttentionMessage || null,
    });
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(500).json({ error: 'Failed to create task.' });
  }
});

// GET all tasks (no RBAC here, all tasks are fetched)
app.get('/api/tasks', (req, res) => {
  const { includeArchived, includeRecurringTemplates } = req.query; // Removed userId, userRole from destructuring

  let query = 'SELECT * FROM tasks WHERE 1=1'; // Start with a always-true condition
  let params = []; // No params needed for this part of the query

  // Filter out archived tasks by default
  if (includeArchived !== 'true') {
    query += ' AND isArchived = 0';
  }

  // No longer filtering templates as instances are not yet automatically generated
  // if (includeRecurringTemplates !== 'true') {
  //   query += " AND NOT (recurrenceType != 'none' AND recurrenceId = id)"; 
  // }
  
  query += ' ORDER BY creationDate DESC';

  try {
    const tasks = db.prepare(query).all(params).map(task => { // params will be empty array
      try {
        return {
          ...task,
          recurrence: (task.recurrenceType && task.recurrenceType !== 'none') ? {
            type: task.recurrenceType,
            interval: task.recurrenceInterval,
            daysOfWeek: safelyParseJSON(task.recurrenceDaysOfWeek),
            dayOfMonth: task.recurrenceDayOfMonth,
            monthOfYear: task.recurrenceMonthOfYear,
            endDate: task.recurrenceEndDate,
          } : undefined,
          annotations: safelyParseJSON(task.annotations),
          needsAdminAttention: !!task.needsAdminAttention, // Convert 0/1 to boolean
          hasAdminResponse: !!task.hasAdminResponse, // Convert 0/1 to boolean
        };
      } catch (mapErr) {
        console.error(`Error mapping task ID ${task.id}:`, mapErr, 'Task data:', task);
        throw mapErr; // Re-throw to be caught by outer catch
      }
    });
    res.json(tasks);
  } catch (err) {
    console.error('Detailed Error fetching tasks:', err); // Log the actual error
    res.status(500).json({ error: 'Failed to fetch tasks.', details: err.message }); // Send details to frontend
  }
});

// GET a single task (with new RBAC)
app.get('/api/tasks/:id', (req, res) => {
  const taskId = req.params.id;
  const { userId, userRole } = req.query; 

  if (!userId || !userRole) {
    return res.status(401).json({ error: 'Authentication required for task access.' });
  }

  try {
    const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
    const task = stmt.get(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    // New RBAC Check for viewing details
    // Admins can view any task
    // Creator can view their tasks
    // Assigned user can view their tasks
    // If assigned to 'all_users', anyone can view it
    const canView = userRole === 'Administrador' ||
                    task.creator === userId ||
                    task.assignedUser === userId ||
                    task.assignedUser === 'all_users';

    if (!canView) {
      return res.status(403).json({ error: 'Access denied to view this task details.' });
    }
    
    // Parse JSON fields (reuse parsing logic from GET /api/tasks)
    const parsedTask = {
      ...task,
      recurrence: (task.recurrenceType && task.recurrenceType !== 'none') ? {
        type: task.recurrenceType,
        interval: task.recurrenceInterval,
        daysOfWeek: safelyParseJSON(task.recurrenceDaysOfWeek),
        dayOfMonth: task.recurrenceDayOfMonth,
        monthOfYear: task.recurrenceMonthOfYear,
        endDate: task.recurrenceEndDate,
      } : undefined,
      annotations: safelyParseJSON(task.annotations),
      needsAdminAttention: !!task.needsAdminAttention,
      hasAdminResponse: !!task.hasAdminResponse,
    };
    
    res.json(parsedTask);
  } catch (err) {
    console.error('Error fetching single task:', err); // More specific error log
    res.status(500).json({ error: 'Failed to fetch task.', details: err.message });
  }
});

// UPDATE Task (with RBAC)
app.put('/api/tasks/:id', (req, res) => {
  const taskId = req.params.id;
  const { userId, userRole } = req.query; // Assuming user info is passed in query for now
  const {
    title, description, assignedUser, priority, status, dueDate, color, isArchived,
    recurrence, originalDueDate, annotations, needsAdminAttention, adminAttentionMessage,
    adminResolutionMessage, hasAdminResponse
  } = req.body;

  if (!userId || !userRole) {
    return res.status(401).json({ error: 'Authentication required for task update.' });
  }

  try {
    const existingTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);

    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    // RBAC Check - Admins can update any task. Creators can update their own tasks. Operators can update their assigned tasks.
    if (userRole !== 'Administrador') {
      const isCreator = existingTask.creator === userId;
      const isAssigned = existingTask.assignedUser === userId || existingTask.assignedUser === 'all_users';
      
      if (!isCreator && !isAssigned) {
        return res.status(403).json({ error: 'Access denied to update this task.' });
      }
    }

    let completionDate = existingTask.completionDate;
    // If status changes to 'Concluída' and completionDate is not set, set it now.
    if (status === 'Concluída' && !existingTask.completionDate) {
      completionDate = new Date().toISOString();
    } 
    // If status changes from 'Concluída' to something else, clear completionDate.
    else if (status !== 'Concluída' && existingTask.completionDate) {
      completionDate = null;
    }

    const stmt = db.prepare(`
      UPDATE tasks
      SET title = @title,
          description = @description,
          assignedUser = @assignedUser,
          priority = @priority,
          status = @status,
          dueDate = @dueDate,
          color = @color,
          isArchived = @isArchived,
          completionDate = @completionDate,
          recurrenceType = @recurrenceType,
          recurrenceInterval = @recurrenceInterval,
          recurrenceDaysOfWeek = @recurrenceDaysOfWeek,
          recurrenceDayOfMonth = @recurrenceDayOfMonth,
          recurrenceMonthOfYear = @recurrenceMonthOfYear,
          recurrenceEndDate = @recurrenceEndDate,
          recurrenceId = @recurrenceId,
          originalDueDate = @originalDueDate,
          annotations = @annotations,
          needsAdminAttention = @needsAdminAttention,
          adminAttentionMessage = @adminAttentionMessage,
          adminResolutionMessage = @adminResolutionMessage,
          hasAdminResponse = @hasAdminResponse
      WHERE id = @id
    `);

    const result = stmt.run({
      id: taskId,
      title: title !== undefined ? title : existingTask.title,
      description: description !== undefined ? description : existingTask.description,
      assignedUser: assignedUser !== undefined ? assignedUser : existingTask.assignedUser,
      priority: priority !== undefined ? priority : existingTask.priority,
      status: status !== undefined ? status : existingTask.status,
      dueDate: dueDate !== undefined ? dueDate : existingTask.dueDate,
      color: color !== undefined ? color : existingTask.color,
      isArchived: isArchived !== undefined ? isArchived : existingTask.isArchived,
      completionDate: completionDate,
      recurrenceType: recurrence?.type || existingTask.recurrenceType,
      recurrenceInterval: recurrence?.interval || existingTask.recurrenceInterval,
      recurrenceDaysOfWeek: recurrence?.daysOfWeek ? JSON.stringify(recurrence.daysOfWeek) : (existingTask.recurrenceDaysOfWeek || '[]'),
      recurrenceDayOfMonth: recurrence?.dayOfMonth || existingTask.recurrenceDayOfMonth,
      recurrenceMonthOfYear: recurrence?.monthOfYear || existingTask.recurrenceMonthOfYear,
      recurrenceEndDate: recurrence?.endDate || existingTask.recurrenceEndDate,
      recurrenceId: (recurrence?.type && recurrence.type !== 'none') ? (existingTask.recurrenceId || taskId) : null, // If it becomes recurring or was, ensure recurrenceId
      originalDueDate: originalDueDate || existingTask.originalDueDate,
      annotations: annotations ? JSON.stringify(annotations) : (existingTask.annotations || '[]'),
      needsAdminAttention: needsAdminAttention !== undefined ? (needsAdminAttention ? 1 : 0) : existingTask.needsAdminAttention,
      adminAttentionMessage: adminAttentionMessage !== undefined ? adminAttentionMessage : existingTask.adminAttentionMessage,
      adminResolutionMessage: adminResolutionMessage !== undefined ? adminResolutionMessage : existingTask.adminResolutionMessage,
      hasAdminResponse: hasAdminResponse !== undefined ? (hasAdminResponse ? 1 : 0) : existingTask.hasAdminResponse,
    });

    if (result.changes > 0) {
      res.status(200).json({ message: 'Task updated successfully.' });
    } else {
      res.status(404).json({ error: 'Task not found or no changes made.' });
    }
  } catch (err) {
    console.error('Error updating task:', err);
    res.status(500).json({ error: 'Failed to update task.' });
  }
});

// AUTO-ARCHIVE Completed Tasks (Admin only)
app.post('/api/tasks/auto-archive', (req, res) => {
  const { userId, userRole } = req.query; // Assuming user info is passed in query for now

  if (userRole !== 'Administrador') {
    return res.status(403).json({ error: 'Access denied. Only administrators can auto-archive tasks.' });
  }

  try {
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
    const fifteenDaysAgoISO = fifteenDaysAgo.toISOString();

    const stmt = db.prepare(`
      UPDATE tasks
      SET isArchived = 1
      WHERE status = 'Concluída' 
        AND completionDate IS NOT NULL 
        AND completionDate < ? 
        AND isArchived = 0
    `);

    const result = stmt.run(fifteenDaysAgoISO);
    res.status(200).json({ message: `${result.changes} tasks archived successfully.` });
  } catch (err) {
    console.error('Error auto-archiving tasks:', err);
    res.status(500).json({ error: 'Failed to auto-archive tasks.' });
  }
});


// ADD Annotation to Task
app.post('/api/tasks/:taskId/annotation', (req, res) => {
  const taskId = req.params.taskId;
  const { annotationText, userName, userId } = req.body; // Assuming userId is for logged-in user for RBAC

  if (!annotationText || !userName || !userId) {
    return res.status(400).json({ error: 'Annotation text, user name, and user ID are required.' });
  }

  try {
    const existingTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);

    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    // RBAC: Only assignee or admin can add annotations
    if (existingTask.assignedUser !== userId && existingTask.assignedUser !== 'all_users' && req.query.userRole !== 'Administrador') {
      return res.status(403).json({ error: 'Access denied to add annotation to this task.' });
    }

    let annotations = safelyParseJSON(existingTask.annotations);
    annotations.push({
      timestamp: new Date().toISOString(),
      text: annotationText,
      userName: userName,
    });

    const stmt = db.prepare('UPDATE tasks SET annotations = ? WHERE id = ?');
    const result = stmt.run(JSON.stringify(annotations), taskId);

    if (result.changes > 0) {
      res.status(200).json({ message: 'Annotation added successfully.' });
    } else {
      res.status(404).json({ error: 'Task not found or no changes made.' });
    }
  } catch (err) {
    console.error('Error adding annotation:', err);
    res.status(500).json({ error: 'Failed to add annotation.' });
  }
});

// NOTIFY Admin about Task
app.put('/api/tasks/:taskId/admin-attention', (req, res) => {
  const taskId = req.params.taskId;
  const { message, userId } = req.body; // userId for RBAC, message for adminAttentionMessage

  if (!message || !userId) {
    return res.status(400).json({ error: 'Notification message and user ID are required.' });
  }

  try {
    const existingTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);

    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    // RBAC: Only assignee or creator can notify admin
    if (existingTask.assignedUser !== userId && existingTask.creator !== userId && req.query.userRole !== 'Administrador') {
      return res.status(403).json({ error: 'Access denied to notify admin for this task.' });
    }

    const stmt = db.prepare('UPDATE tasks SET needsAdminAttention = ?, adminAttentionMessage = ? WHERE id = ?');
    const result = stmt.run(1, message, taskId); // 1 for true

    if (result.changes > 0) {
      res.status(200).json({ message: 'Admin notified successfully.' });
    } else {
      res.status(404).json({ error: 'Task not found or no changes made.' });
    }
  } catch (err) {
    console.error('Error notifying admin:', err);
    res.status(500).json({ error: 'Failed to notify admin.' });
  }
});



// --- Checking Account CUD ---
// GET all checking account transactions
app.get('/api/checking-account/transactions', (req, res) => {
  try {
    const transactions = db.prepare('SELECT * FROM checking_account_transactions ORDER BY date DESC').all();
    res.json(transactions);
  } catch (err) {
    console.error('Error fetching checking account transactions:', err);
    res.status(500).json({ error: 'Failed to fetch checking account transactions.' });
  }
});

// GET checking account balance
app.get('/api/checking-account/balance', (req, res) => {
  try {
    const result = db.prepare(`
      SELECT 
        (SELECT COALESCE(SUM(value), 0) FROM checking_account_transactions WHERE type = 'Entrada') -
        (SELECT COALESCE(SUM(value), 0) FROM checking_account_transactions WHERE type = 'Saída') AS balance
    `).get();
    res.json(result);
  } catch (err) {
    console.error('Error fetching checking account balance:', err);
    res.status(500).json({ error: 'Failed to fetch checking account balance.' });
  }
});

// --- Safe Entries CUD ---
// GET all safe entries
app.get('/api/safe-entries', (req, res) => {
  try {
    const entries = db.prepare('SELECT * FROM safe_entries ORDER BY date DESC').all();
    res.json(entries);
  } catch (err) {
    console.error('Error fetching safe entries:', err);
    res.status(500).json({ error: 'Failed to fetch safe entries.' });
  }
});

// CREATE safe entry
app.post('/api/safe-entries', (req, res) => {
  try {
    const entry = req.body;
    const stmt = db.prepare(`
      INSERT INTO safe_entries (id, date, description, type, value, userName, source_id)
      VALUES (@id, @date, @description, @type, @value, @userName, @source_id)
    `);
    stmt.run({ ...entry, source_id: entry.source_id || null });

    // Auto-create task if withdrawal >= R$ 1000
    console.log(`[SAFE ENTRY] Created entry. Type: ${entry.type}, Value: ${entry.value}`);
    
    if (entry.type === 'Saída' && entry.value >= 1000) {
      console.log('[TASK AUTO] Withdrawal >= 1000 detected. Attempting to create task...');
      
      try {
        // Get first admin user
        const adminUser = db.prepare("SELECT id FROM users WHERE role = 'Administrador' LIMIT 1").get();
        console.log('[TASK AUTO] Admin user found:', adminUser);
        
        if (adminUser) {
          const taskId = 'task-' + Date.now();
          const now = new Date();
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          
          const taskStmt = db.prepare(`
            INSERT INTO tasks (
              id, title, description, assignedUser, creator, priority, status, 
              dueDate, creationDate, color, isArchived, annotations, 
              needsAdminAttention, hasAdminResponse
            ) VALUES (
              @id, @title, @description, @assignedUser, @creator, @priority, @status,
              @dueDate, @creationDate, @color, @isArchived, @annotations, 
              @needsAdminAttention, @hasAdminResponse
            )
          `);
          
          const taskData = {
            id: taskId,
            title: 'Realizar Depósito Bancário',
            description: `Cofre atingiu R$ ${entry.value.toFixed(2)} em retirada realizada por ${entry.userName}. Realizar depósito no banco para segurança.`,
            assignedUser: adminUser.id,
            creator: adminUser.id, // System-generated, attributed to admin
            priority: 'Urgente',
            status: 'A Fazer',
            dueDate: tomorrow.toISOString(),
            creationDate: now.toISOString(),
            color: 'orange',
            isArchived: 0,
            annotations: '[]',
            needsAdminAttention: 0,
            hasAdminResponse: 0
          };
          
          console.log('[TASK AUTO] Inserting task with data:', taskData);
          taskStmt.run(taskData);
          console.log(`[TASK AUTO] ✓ Task ${taskId} created successfully for withdrawal of R$ ${entry.value}`);
        } else {
          console.warn('[TASK AUTO] No admin user found. Task not created.');
        }
      } catch (taskErr) {
        console.error('[TASK AUTO] ✗ Error creating task:', taskErr);
        // Continue execution - don't fail the safe entry creation
      }
    }

    res.status(201).json(entry); // Return the created entry
  } catch (err) {
    console.error('Error creating safe entry:', err);
    res.status(500).json({ error: 'Failed to create safe entry.' });
  }
});

// DELETE safe entry
app.delete('/api/safe-entries/:id', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM safe_entries WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes > 0) {
      res.status(200).json({ message: 'Safe entry deleted successfully.' });
    } else {
      res.status(404).json({ error: 'Safe entry not found.' });
    }
  } catch (err) {
    console.error('Error deleting safe entry:', err);
    res.status(500).json({ error: 'Failed to delete safe entry.' });
  }
});


// ===== CRM MODULE ENDPOINTS =====

// --- Customers CRUD ---
// GET all customers
app.get('/api/customers', (req, res) => {
  try {
    const customers = db.prepare('SELECT * FROM customers ORDER BY name ASC').all();
    res.json(customers);
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({ error: 'Failed to fetch customers.' });
  }
});

// GET inactive customers for CRM retention
app.get('/api/customers-inactive', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    
    // Calcula a data limite (há X dias atrás)
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - days);
    const thresholdStr = thresholdDate.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Busca último log de mensagem por cliente
    const msgMap = {};
    try {
      const msgList = db.prepare(`
        SELECT customerId, MAX(sentAt) as last_message 
        FROM message_log 
        WHERE customerId IS NOT NULL AND customerId != ''
        GROUP BY customerId
      `).all();
      msgList.forEach(m => { 
        if (m.customerId) {
          msgMap[m.customerId] = m.last_message.substring(0, 10); 
        }
      });
    } catch (e) {
      console.warn('Tabela message_log não possui dados ou coluna inválida:', e.message);
    }

    const customers = db.prepare('SELECT * FROM customers').all();
    
    const inactiveCustomers = customers.map(c => {
      const lastMessage = msgMap[c.id] || null;
      
      return {
        ...c,
        lastMessage,
        lastInteraction: lastMessage // Somente a última mensagem de WhatsApp é considerada
      };
    }).filter(c => {
      // Se nunca enviou mensagem de WhatsApp, usa a data de criação do cadastro
      const refDate = c.lastInteraction || c.createdAt.substring(0, 10) || '1970-01-01';
      return refDate < thresholdStr;
    });
    
    // Ordena por maior tempo sem contato (mais inativo primeiro)
    inactiveCustomers.sort((a, b) => {
      const dateA = a.lastInteraction || '1970-01-01';
      const dateB = b.lastInteraction || '1970-01-01';
      return dateA.localeCompare(dateB);
    });
    
    res.json(inactiveCustomers);
  } catch (err) {
    console.error('Error fetching inactive customers:', err);
    res.status(500).json({ error: 'Failed to fetch inactive customers.' });
  }
});

// GET single customer by ID
app.get('/api/customers/:id', (req, res) => {
  try {
    const { id } = req.params;
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    if (customer) {
      res.json(customer);
    } else {
      res.status(404).json({ error: 'Customer not found.' });
    }
  } catch (err) {
    console.error('Error fetching customer:', err);
    res.status(500).json({ error: 'Failed to fetch customer.' });
  }
});

// CREATE customer
app.post('/api/customers', (req, res) => {
  try {
    const customer = req.body;
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO customers (id, name, nickname, cpf, phone, email, address, notes, creditLimit, dueDay, birthDate, createdAt, updatedAt)
      VALUES (@id, @name, @nickname, @cpf, @phone, @email, @address, @notes, @creditLimit, @dueDay, @birthDate, @createdAt, @updatedAt)
    `);
    stmt.run({
      id: customer.id,
      name: customer.name,
      nickname: customer.nickname || null,
      cpf: customer.cpf || null,
      phone: customer.phone || null,
      email: customer.email || null,
      address: customer.address || null,
      notes: customer.notes || null,
      creditLimit: customer.creditLimit || 0,
      dueDay: customer.dueDay || null,
      birthDate: customer.birthDate || null,
      createdAt: now,
      updatedAt: now,
    });
    res.status(201).json({ ...customer, creditLimit: customer.creditLimit || 0, dueDay: customer.dueDay || null, birthDate: customer.birthDate || null, createdAt: now, updatedAt: now });
  } catch (err) {
    console.error('Error creating customer:', err);
    res.status(500).json({ error: 'Failed to create customer.' });
  }
});

// UPDATE customer
app.put('/api/customers/:id', (req, res) => {
  try {
    const { id } = req.params;
    const customer = req.body;
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE customers
      SET name = @name, nickname = @nickname, cpf = @cpf, phone = @phone, 
          email = @email, address = @address, notes = @notes, creditLimit = @creditLimit, dueDay = @dueDay, birthDate = @birthDate, updatedAt = @updatedAt
      WHERE id = @id
    `);
    const result = stmt.run({
      id,
      name: customer.name,
      nickname: customer.nickname || null,
      cpf: customer.cpf || null,
      phone: customer.phone || null,
      email: customer.email || null,
      address: customer.address || null,
      notes: customer.notes || null,
      creditLimit: customer.creditLimit || 0,
      dueDay: customer.dueDay || null,
      birthDate: customer.birthDate || null,
      updatedAt: now,
    });
    if (result.changes > 0) {
      res.status(200).json({ ...customer, id, updatedAt: now });
    } else {
      res.status(404).json({ error: 'Customer not found.' });
    }
  } catch (err) {
    console.error('Error updating customer:', err);
    res.status(500).json({ error: 'Failed to update customer.' });
  }
});

// DELETE customer (only if no debts)
app.delete('/api/customers/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if customer has debts
    const debts = db.prepare('SELECT COUNT(*) as count FROM customer_debts WHERE customerId = ?').get(id);
    if (debts.count > 0) {
      return res.status(400).json({ error: 'Cannot delete customer with existing debts. Remove debts first.' });
    }
    
    const stmt = db.prepare('DELETE FROM customers WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes > 0) {
      res.status(200).json({ message: 'Customer deleted successfully.' });
    } else {
      res.status(404).json({ error: 'Customer not found.' });
    }
  } catch (err) {
    console.error('Error deleting customer:', err);
    res.status(500).json({ error: 'Failed to delete customer.' });
  }
});

// --- Customer Debts CRUD ---
// GET all customer debts (with customer names via JOIN)
app.get('/api/customer-debts', (req, res) => {
  try {
    const debts = db.prepare(`
      SELECT cd.*, c.name as customerName, c.nickname as customerNickname
      FROM customer_debts cd
      LEFT JOIN customers c ON cd.customerId = c.id
      ORDER BY cd.purchaseDate DESC
    `).all();
    res.json(debts);
  } catch (err) {
    console.error('Error fetching customer debts:', err);
    res.status(500).json({ error: 'Failed to fetch customer debts.' });
  }
});

// GET debts for a specific customer
app.get('/api/customers/:id/debts', (req, res) => {
  try {
    const { id } = req.params;
    const debts = db.prepare(`
      SELECT * FROM customer_debts 
      WHERE customerId = ? 
      ORDER BY purchaseDate DESC
    `).all(id);
    res.json(debts);
  } catch (err) {
    console.error('Error fetching customer debts:', err);
    res.status(500).json({ error: 'Failed to fetch customer debts.' });
  }
});

// GET customer with total pending debt (for limit validation)
app.get('/api/customers/:id/balance', (req, res) => {
  try {
    const { id } = req.params;
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }
    
    const debtTotal = db.prepare(`
      SELECT COALESCE(SUM(totalValue), 0) as total 
      FROM customer_debts 
      WHERE customerId = ? AND status IN ('Pendente', 'Atrasado')
    `).get(id);
    
    res.json({
      ...customer,
      totalDebt: debtTotal.total,
      availableCredit: (customer.creditLimit || 0) - debtTotal.total,
    });
  } catch (err) {
    console.error('Error fetching customer balance:', err);
    res.status(500).json({ error: 'Failed to fetch customer balance.' });
  }
});

// CREATE customer debt
app.post('/api/customer-debts', (req, res) => {
  try {
    const debt = req.body;
    const stmt = db.prepare(`
      INSERT INTO customer_debts (id, customerId, purchaseDate, description, totalValue, status, userName)
      VALUES (@id, @customerId, @purchaseDate, @description, @totalValue, @status, @userName)
    `);
    stmt.run({
      ...debt,
      status: debt.status || 'Pendente',
    });
    res.status(201).json(debt);
  } catch (err) {
    console.error('Error creating customer debt:', err);
    res.status(500).json({ error: 'Failed to create customer debt.' });
  }
});

// UPDATE customer debt (change status, mark as paid)
app.put('/api/customer-debts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { status, paidAt } = req.body;
    
    const stmt = db.prepare(`
      UPDATE customer_debts
      SET status = @status, paidAt = @paidAt
      WHERE id = @id
    `);
    
    const transResult = db.transaction(() => {
      const result = stmt.run({ id, status, paidAt: paidAt || null });

      if (result.changes > 0 && status === 'Pago') {
        const debt = db.prepare('SELECT * FROM customer_debts WHERE id = ?').get(id);
        const customer = db.prepare('SELECT name FROM customers WHERE id = ?').get(debt.customerId);
        
        // Add entry to today's daily record
        const today = new Date().toISOString().split('T')[0];
        let dailyRecord = db.prepare('SELECT * FROM daily_records WHERE date = ? AND lancado = 0').get(today);
        
        const receiptItem = {
          id: Date.now().toString(),
          date: new Date().toISOString(),
          customer: customer ? customer.name : 'Cliente Desconhecido',
          val: debt.totalValue,
          description: debt.description
        };

        if (dailyRecord) {
          const creditReceipts = safelyParseJSON(dailyRecord.creditReceipts);
          creditReceipts.push(receiptItem);
          
          db.prepare('UPDATE daily_records SET creditReceipts = ? WHERE id = ?')
            .run(JSON.stringify(creditReceipts), dailyRecord.id);
        } else {
          // Create new record
          const date = today;
          const id = 'rec_' + Date.now();
          const creditReceipts = [receiptItem];
          const expenses = [];
          const nonRegistered = [];
          const pixDiretoList = [];
          const crediarioList = [];

          db.prepare(`
            INSERT INTO daily_records (id, date, expenses, nonRegistered, pixDiretoList, crediarioList, creditReceipts, sangrias, userName, lancado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
          `).run(id, date, JSON.stringify(expenses), JSON.stringify(nonRegistered), JSON.stringify(pixDiretoList), JSON.stringify(crediarioList), JSON.stringify(creditReceipts), JSON.stringify([]), debt.userName);
        }
      }
      return result;
    })();

    if (transResult.changes > 0) {
      res.status(200).json({ message: 'Debt updated successfully.' });
    } else {
      res.status(404).json({ error: 'Debt not found.' });
    }
  } catch (err) {
    console.error('Error updating customer debt:', err);
    res.status(500).json({ error: 'Failed to update customer debt.' });
  }
});

// PARTIAL PAYMENT for customer debt
app.post('/api/customer-debts/:id/partial-payment', (req, res) => {
  try {
    const { id } = req.params;
    const { paymentAmount, newTotalValue } = req.body;
    
    const transResult = db.transaction(() => {
      // Get the debt info
      const debt = db.prepare('SELECT * FROM customer_debts WHERE id = ?').get(id);
      if (!debt) {
        throw new Error('Debt not found');
      }

      const customer = db.prepare('SELECT name FROM customers WHERE id = ?').get(debt.customerId);
      
      // Update the debt with the new reduced value
      const updateStmt = db.prepare(`
        UPDATE customer_debts
        SET totalValue = @newTotalValue
        WHERE id = @id
      `);
      updateStmt.run({ id, newTotalValue });

      // Add the payment to today's daily record
      const today = new Date().toISOString().split('T')[0];
      let dailyRecord = db.prepare('SELECT * FROM daily_records WHERE date = ? AND lancado = 0').get(today);
      
      const receiptItem = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        customer: customer ? customer.name : 'Cliente Desconhecido',
        val: paymentAmount,
        description: `Pagamento parcial - ${debt.description || 'Compra'}`
      };

      if (dailyRecord) {
        const creditReceipts = safelyParseJSON(dailyRecord.creditReceipts);
        creditReceipts.push(receiptItem);
        
        db.prepare('UPDATE daily_records SET creditReceipts = ? WHERE id = ?')
          .run(JSON.stringify(creditReceipts), dailyRecord.id);
      } else {
        // Create new record
        const date = today;
        const recordId = 'rec_' + Date.now();
        const creditReceipts = [receiptItem];
        const expenses = [];
        const nonRegistered = [];
        const pixDiretoList = [];
        const crediarioList = [];

        db.prepare(`
          INSERT INTO daily_records (id, date, expenses, nonRegistered, pixDiretoList, crediarioList, creditReceipts, sangrias, userName, lancado)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).run(recordId, date, JSON.stringify(expenses), JSON.stringify(nonRegistered), JSON.stringify(pixDiretoList), JSON.stringify(crediarioList), JSON.stringify(creditReceipts), JSON.stringify([]), debt.userName);
      }

      return { success: true };
    })();

    res.status(200).json({ message: 'Partial payment processed successfully.' });
  } catch (err) {
    console.error('Error processing partial payment:', err);
    res.status(500).json({ error: 'Failed to process partial payment.' });
  }
});

// DELETE customer debt
app.delete('/api/customer-debts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM customer_debts WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes > 0) {
      res.status(200).json({ message: 'Debt deleted successfully.' });
    } else {
      res.status(404).json({ error: 'Debt not found.' });
    }
  } catch (err) {
    console.error('Error deleting customer debt:', err);
    res.status(500).json({ error: 'Failed to delete customer debt.' });
  }
});

// --- Debtors Report (aggregated) ---
// GET customers with pending/overdue debts, ordered by total owed (highest first)
app.get('/api/debtors-report', (req, res) => {
  try {
    const debtors = db.prepare(`
      SELECT 
        c.id,
        c.name,
        c.nickname,
        c.phone,
        c.dueDay,
        COUNT(cd.id) as debtCount,
        SUM(cd.totalValue) as totalOwed,
        MAX(CASE WHEN cd.status = 'Atrasado' THEN 1 ELSE 0 END) as hasOverdueManual
      FROM customers c
      INNER JOIN customer_debts cd ON c.id = cd.customerId
      WHERE cd.status IN ('Pendente', 'Atrasado')
      GROUP BY c.id
      ORDER BY totalOwed DESC
    `).all();

    const currentDay = new Date().getDate();
    const debtorsWithStatus = debtors.map(d => ({
      ...d,
      hasOverdue: (d.hasOverdueManual === 1) || (d.dueDay && currentDay > d.dueDay) ? 1 : 0
    }));

    res.json(debtorsWithStatus);
  } catch (err) {
    console.error('Error fetching debtors report:', err);
    console.error(err.stack); // Log stack trace
    res.status(500).json({ error: 'Failed to fetch debtors report.', details: err.message });
  }
});

// --- Bug Tracking System ---
// GET all bugs
app.get('/api/bugs', (req, res) => {
  try {
    const bugs = db.prepare('SELECT * FROM bugs ORDER BY createdAt DESC').all();
    res.json(bugs.map(bug => ({
      ...bug,
      screenshots: safelyParseJSON(bug.screenshots)
    })));
  } catch (err) {
    console.error('Error fetching bugs:', err);
    res.status(500).json({ error: 'Failed to fetch bugs.' });
  }
});

// CREATE bug
app.post('/api/bugs', (req, res) => {
  try {
    const bug = req.body;
    const stmt = db.prepare(`
      INSERT INTO bugs (id, title, description, reporter, priority, status, category, createdAt, screenshots)
      VALUES (@id, @title, @description, @reporter, @priority, @status, @category, @createdAt, @screenshots)
    `);
    stmt.run({
      ...bug,
      screenshots: JSON.stringify(bug.screenshots || [])
    });
    res.status(201).json(bug);
  } catch (err) {
    console.error('Error creating bug:', err);
    res.status(500).json({ error: 'Failed to create bug.' });
  }
});

// UPDATE bug
app.put('/api/bugs/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const stmt = db.prepare(`
      UPDATE bugs 
      SET title = @title, 
          description = @description,
          priority = @priority,
          status = @status,
          category = @category,
          resolvedAt = @resolvedAt,
          resolvedBy = @resolvedBy,
          resolutionNotes = @resolutionNotes,
          screenshots = @screenshots
      WHERE id = @id
    `);
    
    stmt.run({
      id,
      ...updates,
      screenshots: JSON.stringify(updates.screenshots || [])
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating bug:', err);
    res.status(500).json({ error: 'Failed to update bug.' });
  }
});

// DELETE bug (Admin only)
app.delete('/api/bugs/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM bugs WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting bug:', err);
    res.status(500).json({ error: 'Failed to delete bug.' });
  }
});

// --- Flyering Tasks CUD ---
// GET all flyering tasks
app.get('/api/flyering', (req, res) => {
  try {
    const tasks = db.prepare('SELECT * FROM flyering_tasks ORDER BY createdAt DESC').all().map(task => ({
      ...task,
      coordinates: safelyParseJSON(task.coordinates)
    }));
    res.json(tasks);
  } catch (err) {
    console.error('Error fetching flyering tasks:', err);
    res.status(500).json({ error: 'Failed to fetch flyering tasks.' });
  }
});

// CREATE flyering task
app.post('/api/flyering', (req, res) => {
  try {
    const task = req.body;
    const stmt = db.prepare(`
      INSERT INTO flyering_tasks (id, type, coordinates, assignedUserId, status, color, createdAt, createdBy, description, area)
      VALUES (@id, @type, @coordinates, @assignedUserId, @status, @color, @createdAt, @createdBy, @description, @area)
    `);
    stmt.run({
      ...task,
      description: task.description || null,
      area: task.area || null,
      coordinates: JSON.stringify(task.coordinates)
    });
    res.status(201).json({ message: 'Flyering task created successfully.' });
  } catch (err) {
    console.error('Error creating flyering task:', err);
    res.status(500).json({ error: 'Failed to create flyering task.' });
  }
});

// UPDATE flyering task
app.put('/api/flyering/:id', (req, res) => {
  try {
    const { id } = req.params;
    const task = req.body;
    const stmt = db.prepare(`
      UPDATE flyering_tasks
      SET type = @type, coordinates = @coordinates, assignedUserId = @assignedUserId, 
          status = @status, description = @description, area = @area
      WHERE id = @id
    `);
    const result = stmt.run({
      ...task,
      id,
      description: task.description || null,
      area: task.area || null,
      coordinates: JSON.stringify(task.coordinates)
    });
    if (result.changes > 0) {
      res.json({ message: 'Flyering task updated successfully.' });
    } else {
      res.status(404).json({ error: 'Flyering task not found.' });
    }
  } catch (err) {
    console.error('Error updating flyering task:', err);
    res.status(500).json({ error: 'Failed to update flyering task.' });
  }
});

// DELETE flyering task
app.delete('/api/flyering/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM flyering_tasks WHERE id = ?').run(id);
    if (result.changes > 0) {
      res.json({ message: 'Flyering task deleted successfully.' });
    } else {
      res.status(404).json({ error: 'Flyering task not found.' });
    }
  } catch (err) {
    console.error('Error deleting flyering task:', err);
    res.status(500).json({ error: 'Failed to delete flyering task.' });
  }
});


// ============================================================================
// MÓDULO iFOOD - Endpoints para Vendas iFood
// ============================================================================

// GET all iFood sales (com filtro opcional por status e mês)
app.get('/api/ifood-sales', (req, res) => {
  try {
    const { status, month, year, includeOverdue, page = 1, limit = 50 } = req.query;
    let query = 'SELECT * FROM ifood_sales';
    let countQuery = 'SELECT COUNT(*) as count FROM ifood_sales';
    let conditions = [];
    let params = [];

    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    
    if (month && year) {
      if (includeOverdue === 'true') {
        const today = new Date().toISOString().split('T')[0];
        conditions.push(`((strftime('%m', sale_date) = ? AND strftime('%Y', sale_date) = ?) OR (status = 'Pendente' AND payment_due_date < ?))`);
        params.push(String(month).padStart(2, '0'), String(year), today);
      } else {
        conditions.push("strftime('%m', sale_date) = ? AND strftime('%Y', sale_date) = ?");
        params.push(String(month).padStart(2, '0'), String(year));
      }
    }

    if (conditions.length > 0) {
      const conditionStr = ' WHERE ' + conditions.join(' AND ');
      query += conditionStr;
      countQuery += conditionStr;
    }
    
    // Sort logic: Pendentes (vencimento e antiguidade), Recebidos (data decrescente)
    if (status === 'Pendente') {
        query += ' ORDER BY payment_due_date ASC, sale_date ASC';
    } else {
        query += ' ORDER BY sale_date DESC';
    }

    // Pagination
    const limitVal = parseInt(limit);
    const pageVal = parseInt(page);
    const offset = (pageVal - 1) * limitVal;

    query += ` LIMIT ? OFFSET ?`;
    const queryParams = [...params, limitVal, offset];

    const sales = db.prepare(query).all(...queryParams);
    const totalCount = db.prepare(countQuery).get(...params).count;

    res.json({
      data: sales,
      pagination: {
        total: totalCount,
        page: pageVal,
        limit: limitVal,
        totalPages: Math.ceil(totalCount / limitVal)
      }
    });

  } catch (err) {
    console.error('Error fetching iFood sales:', err);
    res.status(500).json({ error: 'Failed to fetch iFood sales.' });
  }
});

// GET iFood sales dashboard/summary
app.get('/api/ifood-sales/dashboard', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    const totalPending = db.prepare(`
      SELECT COALESCE(SUM(net_value), 0) as total, COUNT(*) as count 
      FROM ifood_sales WHERE status = 'Pendente'
    `).get();

    const totalReceived = db.prepare(`
      SELECT COALESCE(SUM(net_value), 0) as total, COUNT(*) as count 
      FROM ifood_sales WHERE status = 'Recebido'
    `).get();

    const dueSoon = db.prepare(`
      SELECT * FROM ifood_sales 
      WHERE status = 'Pendente' AND payment_due_date <= date(?, '+3 days')
      ORDER BY payment_due_date ASC
    `).all(today);

    const dueToday = db.prepare(`
      SELECT * FROM ifood_sales 
      WHERE status = 'Pendente' AND payment_due_date = ?
    `).all(today);

    const overdue = db.prepare(`
      SELECT * FROM ifood_sales 
      WHERE status = 'Pendente' AND payment_due_date < ?
      ORDER BY payment_due_date ASC
    `).all(today);

    res.json({
      totalPending: totalPending.total,
      pendingCount: totalPending.count,
      totalReceived: totalReceived.total,
      receivedCount: totalReceived.count,
      dueSoon,
      dueToday,
      overdue,
    });
  } catch (err) {
    console.error('Error fetching iFood dashboard:', err);
    res.status(500).json({ error: 'Failed to fetch iFood dashboard.' });
  }
});

// GET iFood notifications (pagamentos próximos do vencimento)
app.get('/api/ifood-sales/notifications', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Pagamentos vencendo hoje
    const dueToday = db.prepare(`
      SELECT * FROM ifood_sales 
      WHERE status = 'Pendente' AND payment_due_date = ?
    `).all(today);

    // Pagamentos atrasados
    const overdue = db.prepare(`
      SELECT * FROM ifood_sales 
      WHERE status = 'Pendente' AND payment_due_date < ?
      ORDER BY payment_due_date ASC
    `).all(today);

    const notifications = [];

    dueToday.forEach(sale => {
      notifications.push({
        type: 'due_today',
        message: `Lembrete: O valor de R$ ${sale.net_value.toFixed(2)} da venda iFood de ${formatDateBR(sale.sale_date)} tem depósito previsto para hoje.`,
        sale,
      });
    });

    overdue.forEach(sale => {
      const daysLate = Math.floor((new Date(today) - new Date(sale.payment_due_date)) / (1000 * 60 * 60 * 24));
      notifications.push({
        type: 'overdue',
        message: `Atenção: Pagamento iFood de R$ ${sale.net_value.toFixed(2)} está ${daysLate} dia(s) atrasado!`,
        sale,
        daysLate,
      });
    });

    res.json(notifications);
  } catch (err) {
    console.error('Error fetching iFood notifications:', err);
    res.status(500).json({ error: 'Failed to fetch iFood notifications.' });
  }
});

// Helper para formatação de data
function formatDateBR(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('pt-BR');
}

// CREATE iFood sale
app.post('/api/ifood-sales', (req, res) => {
  try {
    const sale = req.body;
    const now = new Date().toISOString();
    
    // Calcular data de previsão (30 dias após a venda)
    const saleDate = new Date(sale.sale_date + 'T12:00:00Z');
    const dueDate = new Date(saleDate);
    dueDate.setDate(dueDate.getDate() + 30);
    const dueDateStr = dueDate.toISOString().split('T')[0];

    // Calcular taxa e valor líquido
    const grossValue = sale.gross_value;
    const feePercent = sale.operator_fee_percent || 0;
    const feeValue = grossValue * (feePercent / 100);
    const netValue = grossValue - feeValue;

    const id = sale.id || 'ifood_' + Date.now();

    const stmt = db.prepare(`
      INSERT INTO ifood_sales (id, sale_date, gross_value, operator_fee_percent, operator_fee_value, net_value, payment_due_date, status, description, daily_record_id, user_name, created_at)
      VALUES (@id, @sale_date, @gross_value, @operator_fee_percent, @operator_fee_value, @net_value, @payment_due_date, @status, @description, @daily_record_id, @user_name, @created_at)
    `);

    stmt.run({
      id,
      sale_date: sale.sale_date,
      gross_value: grossValue,
      operator_fee_percent: feePercent,
      operator_fee_value: feeValue,
      net_value: netValue,
      payment_due_date: dueDateStr,
      status: 'Pendente',
      description: sale.description || null,
      daily_record_id: sale.daily_record_id || null,
      user_name: sale.user_name,
      created_at: now,
    });

    const createdSale = db.prepare('SELECT * FROM ifood_sales WHERE id = ?').get(id);
    res.status(201).json(createdSale);
  } catch (err) {
    console.error('Error creating iFood sale:', err);
    res.status(500).json({ error: 'Failed to create iFood sale.' });
  }
});

// UPDATE iFood sale
app.put('/api/ifood-sales/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const existing = db.prepare('SELECT * FROM ifood_sales WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'iFood sale not found.' });
    }

    // Recalcular taxa se necessário
    const grossValue = updates.gross_value || existing.gross_value;
    const feePercent = updates.operator_fee_percent !== undefined ? updates.operator_fee_percent : existing.operator_fee_percent;
    const feeValue = grossValue * (feePercent / 100);
    const netValue = grossValue - feeValue;

    const stmt = db.prepare(`
      UPDATE ifood_sales 
      SET gross_value = @gross_value,
          operator_fee_percent = @operator_fee_percent,
          operator_fee_value = @operator_fee_value,
          net_value = @net_value,
          description = @description
      WHERE id = @id
    `);

    stmt.run({
      id,
      gross_value: grossValue,
      operator_fee_percent: feePercent,
      operator_fee_value: feeValue,
      net_value: netValue,
      description: updates.description || existing.description,
    });

    const updatedSale = db.prepare('SELECT * FROM ifood_sales WHERE id = ?').get(id);
    res.json(updatedSale);
  } catch (err) {
    console.error('Error updating iFood sale:', err);
    res.status(500).json({ error: 'Failed to update iFood sale.' });
  }
});

// RECONCILE - Mark iFood sale as received + create checking account entry
app.put('/api/ifood-sales/:id/reconcile', (req, res) => {
  try {
    const { id } = req.params;
    const { userName } = req.body;

    const sale = db.prepare('SELECT * FROM ifood_sales WHERE id = ?').get(id);
    if (!sale) {
      return res.status(404).json({ error: 'iFood sale not found.' });
    }

    if (sale.status === 'Recebido') {
      return res.status(400).json({ error: 'Esta venda já foi marcada como recebida.' });
    }

    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const txId = 'ifood_tx_' + Date.now();

    db.transaction(() => {
      // 1. Marcar venda como recebida
      db.prepare(`
        UPDATE ifood_sales 
        SET status = 'Recebido', received_at = ?, checking_account_id = ?
        WHERE id = ?
      `).run(now, txId, id);

      // 2. Criar lançamento na Conta Corrente (entrada)
      db.prepare(`
        INSERT INTO checking_account_transactions (id, date, description, type, value)
        VALUES (?, ?, ?, 'Entrada', ?)
      `).run(
        txId,
        today,
        `Depósito iFood - Venda de ${formatDateBR(sale.sale_date)} (Valor líquido)`,
        sale.net_value
      );
    })();

    const updatedSale = db.prepare('SELECT * FROM ifood_sales WHERE id = ?').get(id);
    res.json({
      sale: updatedSale,
      message: `Venda marcada como recebida. R$ ${sale.net_value.toFixed(2)} lançado na Conta Corrente.`,
    });
  } catch (err) {
    console.error('Error reconciling iFood sale:', err);
    res.status(500).json({ error: 'Failed to reconcile iFood sale.' });
  }
});

// BATCH RECONCILE - Mark multiple iFood sales as received
app.put('/api/ifood-sales/batch-reconcile', (req, res) => {
  try {
    const { saleIds, userName } = req.body;
    if (!saleIds || !Array.isArray(saleIds) || saleIds.length === 0) {
      return res.status(400).json({ error: 'Nenhuma venda selecionada.' });
    }

    const now = new Date().toISOString();
    const today = now.split('T')[0];
    let totalReconciled = 0;

    db.transaction(() => {
      for (const saleId of saleIds) {
        const sale = db.prepare('SELECT * FROM ifood_sales WHERE id = ? AND status = ?').get(saleId, 'Pendente');
        if (!sale) continue;

        const txId = 'ifood_tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

        db.prepare(`
          UPDATE ifood_sales 
          SET status = 'Recebido', received_at = ?, checking_account_id = ?
          WHERE id = ?
        `).run(now, txId, saleId);

        db.prepare(`
          INSERT INTO checking_account_transactions (id, date, description, type, value)
          VALUES (?, ?, ?, 'Entrada', ?)
        `).run(
          txId,
          today,
          `Depósito iFood - Venda de ${formatDateBR(sale.sale_date)}`,
          sale.net_value
        );

        totalReconciled += sale.net_value;
      }
    })();

    res.json({
      message: `${saleIds.length} venda(s) conciliada(s). Total: R$ ${totalReconciled.toFixed(2)} lançado na Conta Corrente.`,
      totalReconciled,
    });
  } catch (err) {
    console.error('Error batch reconciling iFood sales:', err);
    res.status(500).json({ error: 'Failed to batch reconcile iFood sales.' });
  }
});

// DELETE iFood sale
app.delete('/api/ifood-sales/:id', (req, res) => {
  try {
    const { id } = req.params;
    const sale = db.prepare('SELECT * FROM ifood_sales WHERE id = ?').get(id);
    if (!sale) {
      return res.status(404).json({ error: 'iFood sale not found.' });
    }

    if (sale.status === 'Recebido') {
      return res.status(400).json({ error: 'Não é possível excluir uma venda já recebida.' });
    }

    db.prepare('DELETE FROM ifood_sales WHERE id = ?').run(id);
    res.json({ message: 'iFood sale deleted successfully.' });
  } catch (err) {
    console.error('Error deleting iFood sale:', err);
    res.status(500).json({ error: 'Failed to delete iFood sale.' });
  }
});

// ===== SYSTEM SETTINGS =====

// GET all settings or a specific setting
app.get('/api/settings/:key?', (req, res) => {
  try {
    if (req.params.key) {
      const setting = db.prepare('SELECT * FROM system_settings WHERE key = ?').get(req.params.key);
      if (!setting) {
        // Retorna a chave com valor null ao invés de 404 — permite o frontend tratar graciosamente
        return res.json({ key: req.params.key, value: null, updated_at: null });
      }
      res.json(setting);
    } else {
      const settings = db.prepare('SELECT * FROM system_settings').all();
      res.json(settings);
    }
  } catch (err) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ error: 'Failed to fetch settings.' });
  }
});

// PUT update a setting
app.put('/api/settings/:key', (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    if (value === undefined || value === null) {
      return res.status(400).json({ error: 'Value is required.' });
    }

    const existing = db.prepare('SELECT * FROM system_settings WHERE key = ?').get(key);
    const now = new Date().toISOString();
    
    if (existing) {
      db.prepare('UPDATE system_settings SET value = ?, updated_at = ? WHERE key = ?').run(String(value), now, key);
    } else {
      db.prepare('INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?)').run(key, String(value), now);
    }

    const updated = db.prepare('SELECT * FROM system_settings WHERE key = ?').get(key);
    res.json(updated);
  } catch (err) {
    console.error('Error updating setting:', err);
    res.status(500).json({ error: 'Failed to update setting.' });
  }
});

// ============================================================================
// TESTE WHATSAPP - Endpoint para verificar integração
// ============================================================================
app.get('/api/whatsapp/test', async (req, res) => {
  try {
    const waService = require('./services/whatsapp.service');
    const now = new Date().toLocaleString('pt-BR');

    const result = await waService.notifyAdmin(
      `🧪 *Teste BelaFarma*\n` +
      `✅ Integração WhatsApp funcionando!\n` +
      `🕐 Horário: ${now}`
    );

    if (result.success) {
      res.json({ success: true, message: 'Mensagem de teste enviada com sucesso!' });
    } else {
      res.status(500).json({ success: false, error: result.error || 'Falha ao enviar mensagem' });
    }
  } catch (err) {
    console.error('[WhatsApp Test] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// SISTEMA FOGUETE AMARELO - Inicialização dos Endpoints
// ============================================================================
const { initializeFogueteAmareloEndpoints } = require('./foguete-amarelo-endpoints.js');
const cron = require('node-cron');
const { exec } = require('child_process');


initializeFogueteAmareloEndpoints(app, db);
require('./consignado-endpoints.js')(app, db);

// ============================================================================
// SISTEMA DE MENSAGENS WHATSAPP - Inicialização
// ============================================================================
const { initializeMessageEndpoints } = require('./message-endpoints.js');
const messageTemplates = require('./services/message-templates.service');
const messageScheduler = require('./services/message-scheduler.service');

// Inicializa templates padrão e agendamentos
messageTemplates.initializeDefaultTemplates(db);
messageScheduler.initializeDefaultSchedules(db);

// Registra endpoints da API
initializeMessageEndpoints(app, db);

// Inicia os cron jobs de mensagens
messageScheduler.startScheduler(db);
console.log('📱 Sistema de Mensagens WhatsApp inicializado.');

// Inicia o Message Watcher via pastas locais/docker
const messageWatcher = require('./services/message-watcher.service');
messageWatcher.startWatching();

// ============================================================================
// AGENTE DE MARKETING IA - Inicialização
// ============================================================================
const { initializeMarketingEndpoints } = require('./marketing-endpoints.js');
const marketingScheduler = require('./services/marketing-scheduler.service');

// Registra endpoints da API de marketing
initializeMarketingEndpoints(app, db);

// Módulo Grupos de WhatsApp
const { initializeWhatsAppGroupEndpoints, escolherEPostarOfertaInteligente } = require('./whatsapp-group-endpoints.js');
initializeWhatsAppGroupEndpoints(app, db);

// Módulo Status de WhatsApp
const { postarStatusDiario } = require('./services/whatsapp-status.service.js');

// ============================================================================
// CRON: ROBÔ DE OFERTAS (JIT) E STATUS
// ============================================================================
// Roda a cada hora, nos 10 minutos (08:10, 09:10, ..., 20:10) de Seg a Sex
cron.schedule('10 8-20 * * 1-6', () => {
  escolherEPostarOfertaInteligente();
}, { timezone: 'America/Sao_Paulo' });
console.log('[CRON] 🤖 Robô de Ofertas JIT agendado para rodar a cada hora (:10) das 08h às 20h, Seg-Sáb.');

cron.schedule('0 8 * * 1-6', () => {
  postarStatusDiario();
}, { timezone: 'America/Sao_Paulo' });
console.log('[CRON] 🤖 Robô de Status agendado para rodar às 08h00, Seg-Sáb.');

// Endpoint para disparar o JIT manualmente (para testes)
app.post('/api/whatsapp/offers-bank/trigger-jit', async (req, res) => {
  try {
    console.log('[RoboOfertas JIT] Disparo manual solicitado via API...');
    await escolherEPostarOfertaInteligente();
    res.json({ success: true, message: 'JIT executado! Verifique o histórico.' });
  } catch (err) {
    console.error('[RoboOfertas JIT] Erro no disparo manual:', err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para disparar o Status manualmente (para testes)
app.post('/api/whatsapp/offers-bank/trigger-status', async (req, res) => {
  try {
    console.log('[WhatsAppStatus] Disparo manual solicitado via API...');
    // Roda em background para não travar a requisição
    postarStatusDiario().catch(console.error);
    res.json({ success: true, message: 'Rotina de Status iniciada em segundo plano! Verifique o WhatsApp da farmácia.' });
  } catch (err) {
    console.error('[WhatsAppStatus] Erro no disparo manual:', err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para testar envio simples via Baileys (diagnóstico)
app.post('/api/whatsapp/test-send', express.json(), async (req, res) => {
  const { groupName, message } = req.body;
  if (!groupName || !message) return res.status(400).json({ error: 'groupName e message obrigatórios.' });

  try {
    const baileys = require('./baileys-service.js');
    const status = baileys.getStatus();
    if (!status.connected) return res.status(503).json({ error: 'Baileys não está conectado.', status });

    await baileys.sendTextToGroup(groupName, message);
    res.json({ success: true, message: `Mensagem enviada para "${groupName}"!` });
  } catch (err) {
    console.error('[TestSend] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

// Módulo CRM WhatsApp (Importação de Clientes e Histórico de Produtos)
const { initializeWhatsAppCRMEndpoints } = require('./whatsapp-crm-endpoints.js');
initializeWhatsAppCRMEndpoints(app, db);

// Módulo WhatsApp Vendas (Chat + Estoque + Imagens do Site)
const { initializeWhatsAppVendasEndpoints } = require('./whatsapp-vendas-endpoints.js');
initializeWhatsAppVendasEndpoints(app, db);

// Sincronização de Fotos do Módulo WhatsApp Vendas (Cron & Inicialização)
const whatsappVendasSync = require('./services/whatsapp-vendas-sync.js');
whatsappVendasSync.initSyncCron();
setTimeout(async () => {
  try {
    const syncRes = await whatsappVendasSync.syncScrapedImages();
    if (syncRes.success) {
      console.log(`[BOOT] Sincronização inicial de fotos concluída. Sincronizados: ${syncRes.synchronized}`);
    } else {
      console.warn(`[BOOT] Sincronização inicial de fotos com alerta: ${syncRes.error}`);
    }
  } catch (err) {
    console.error('[BOOT] Erro na sincronização inicial de fotos:', err.message);
  }
}, 30000); // 30 segundos após o boot

// Inicia o scheduler de marketing (relatório toda segunda-feira às 08:00)
marketingScheduler.iniciarScheduler(db);
console.log('🤖 Agente de Marketing IA inicializado.');

const financeEndpoints = require('./finance-endpoints.js');
app.use('/api/finance-agent', financeEndpoints(db));
console.log('🤖 Agente Financeiro IA inicializado.');

const stockEndpoints = require('./stock-endpoints.js');
app.use('/api/stock', stockEndpoints());
console.log('📦 Módulo Controle de Estoque inicializado.');

// Módulo Saúde Financeira (diagnóstico via Gemini)
require('./financial-health-endpoints.js')(app, db);
console.log('💊 Módulo Saúde Financeira inicializado.');

require('./radio-endpoints.js')(app, db);
console.log('📻 Módulo Rádio Bela Farma inicializado.');

// Módulo Consulta Técnica (IA de Medicamentos)
require('./medication-ai-endpoints.js')(app);
console.log('💊 Módulo IA de Medicamentos inicializado.');

// ============================================================================
// AGENTE DE COMPRAS IA - Inicialização
// ============================================================================
const purchasingEndpoints = require('./purchasing-endpoints.js');
const filesEndpoints = require('./files-endpoints.js');
const recipeEndpoints = require('./recipe-endpoints.js');
const systemEndpoints = require('./system-endpoints.js');

app.use('/api/purchasing', purchasingEndpoints(db));
app.use('/api/files', filesEndpoints(db));
app.use('/api/recipes', recipeEndpoints(db));
app.use('/api/system', systemEndpoints(db));
console.log('🤖 Agente de Compras, Central de Arquivos, Receituários e Sistema inicializados.');

// ═══════════════════════════════════════════════════════════════════════════
// BACKUP AUTOMÁTICO — Cópia local do banco + log
// Roda 2x ao dia: 01:00 e 13:00 (horário de Brasília)
// ═══════════════════════════════════════════════════════════════════════════

const BACKUP_DIR = process.platform === 'win32'
  ? path.join(__dirname, '../backups_dev_simulated')
  : path.join(__dirname, 'data/backups');
const DB_BACKUP_PATH = process.env.DB_PATH || path.join(__dirname, 'belafarma.db');
const MAX_BACKUPS = 30; // Mantém os últimos 30 arquivos

function performLocalBackup() {
  const logTag = '[BACKUP AUTO]';
  const now = new Date();
  const ts = now.toISOString()
    .replace('T', '_')
    .replace(/:/g, '-')
    .replace(/\..+/, '');
  const backupFileName = `backup_${ts}.db`;
  const backupFilePath = path.join(BACKUP_DIR, backupFileName);

  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      console.log(`${logTag} Diretório criado: ${BACKUP_DIR}`);
    }

    if (!fs.existsSync(DB_BACKUP_PATH)) {
      console.error(`${logTag} Banco nao encontrado em: ${DB_BACKUP_PATH}`);
      return;
    }

    fs.copyFileSync(DB_BACKUP_PATH, backupFilePath);
    const sizeKB = (fs.statSync(backupFilePath).size / 1024).toFixed(0);
    console.log(`${logTag} Backup criado: ${backupFileName} (${sizeKB} KB)`);

    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('backup_') && f.endsWith('.db'))
      .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    if (files.length > MAX_BACKUPS) {
      files.slice(MAX_BACKUPS).forEach(({ name }) => {
        fs.unlinkSync(path.join(BACKUP_DIR, name));
        console.log(`${logTag} Backup antigo removido: ${name}`);
      });
    }

    console.log(`${logTag} Total de backups: ${Math.min(files.length, MAX_BACKUPS)}/${MAX_BACKUPS}`);

    // Envia o backup via WhatsApp (apenas em producao Linux)
    if (process.env.WA_NOTIFICATIONS_ENABLED !== 'false' && process.platform !== 'win32') {
      sendBackupViaWhatsApp(backupFilePath, backupFileName, sizeKB).catch(err => {
        console.error(`${logTag} Falha no envio do backup via WhatsApp: ${err.message}`);
      });
    }

  } catch (err) {
    console.error(`${logTag} Erro fatal no backup: ${err.message}`);
  }
}

async function sendBackupViaWhatsApp(filePath, fileName, sizeKB) {
  const logTag = '[BACKUP WA]';
  const EVOLUTION_URL  = process.env.EVOLUTION_API_URL || 'http://evolution-api:8080';
  const EVOLUTION_KEY  = process.env.EVOLUTION_API_KEY  || 'BelafarmaSul2026';
  const EVOLUTION_INST = process.env.EVOLUTION_INSTANCE_NAME || 'belafarma';
  const ADMIN_PHONE    = (process.env.ADMIN_WHATSAPP || '').replace(/\D/g, '');

  if (!ADMIN_PHONE) {
    console.warn(`${logTag} ADMIN_WHATSAPP nao configurado. Envio ignorado.`);
    return;
  }

  const fileBuffer = fs.readFileSync(filePath);
  const base64File = fileBuffer.toString('base64');
  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const payload = {
    number: ADMIN_PHONE,
    mediatype: 'document',
    mimetype: 'application/octet-stream',
    caption: `*Backup BelaFarma*\n${agora}\nArquivo: ${fileName}\nTamanho: ${sizeKB} KB\n\nBackup automatico concluido com sucesso!`,
    media: base64File,
    fileName: fileName,
  };

  const response = await fetch(`${EVOLUTION_URL}/message/sendMedia/${EVOLUTION_INST}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_KEY },
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    console.log(`${logTag} Backup enviado para o WhatsApp (${ADMIN_PHONE})`);
  } else {
    const errText = await response.text();
    console.error(`${logTag} Erro ao enviar (${response.status}): ${errText.substring(0, 200)}`);
  }
}


// Roda imediatamente 1 vez ao iniciar o servidor (para confirmar que funciona)
setTimeout(() => {
  console.log('[BACKUP AUTO] 🔄 Backup inicial ao subir o servidor...');
  performLocalBackup();
}, 15000); // 15s após iniciar

// Roda às 01:00 e 13:00 (Brasília)
cron.schedule('0 1 * * *',  performLocalBackup, { timezone: 'America/Sao_Paulo' });
cron.schedule('0 13 * * *', performLocalBackup, { timezone: 'America/Sao_Paulo' });
console.log('[BACKUP AUTO] ⏰ Agendado para 01:00 e 13:00 (Brasília).');

// ─────────────────────────────────────────────────────────────────────────────
// AGENDAMENTO DE NOTÍCIAS IA NA RÁDIO (3x ao dia)
// 08:30 (Manhã), 14:30 (Tarde), 19:30 (Noite)
// ─────────────────────────────────────────────────────────────────────────────
const dispararNoticiasAutomatico = async () => {
  try {
    console.log('[CRON] Iniciando disparo automático de notícias IA...');
    const { gerarCuradoriaNoticas } = require('./services/marketing-agent.service');
    const noticias = await gerarCuradoriaNoticas();
    
    const radioUrl = process.env.RADIO_API_URL || 'http://192.168.1.70:5005';
    console.log(`[CRON] 📡 Enviando notícias para a rádio em: ${radioUrl}`);
    const response = await fetch(`${radioUrl}/api/anunciar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagem: noticias, voz: 'pt-BR-FranciscaNeural' })
    });
    
    if (response.ok) {
      console.log('[CRON] Notícias IA disparadas com sucesso na rádio.');
    } else {
      console.error(`[CRON] Rádio respondeu com erro (${response.status}) ao disparo de notícias.`);
    }
  } catch (err) {
    console.error('[CRON] Erro ao disparar notícias automáticas:', err.message);
  }
};

cron.schedule('30 8 * * *',  dispararNoticiasAutomatico, { timezone: 'America/Sao_Paulo' });
cron.schedule('30 14 * * *', dispararNoticiasAutomatico, { timezone: 'America/Sao_Paulo' });
cron.schedule('30 19 * * *', dispararNoticiasAutomatico, { timezone: 'America/Sao_Paulo' });
console.log('[RADIO CRON] 📻 Notícias agendadas: 08:30, 14:30 e 19:30.');

// ─────────────────────────────────────────────────────────────────────────────
// CRON: ROBÔ DE FALTAS AUTOMÁTICAS (AUTO-SHORTAGES)
// Roda diariamente às 23:30 (Brasília) buscando vendas do dia (daysAgo = 0)
// ─────────────────────────────────────────────────────────────────────────────
cron.schedule('30 23 * * *', async () => {
  try {
    console.log('[CRON-AUTO-SHORTAGES] Iniciando verificação diária de faltas automáticas...');
    const autoShortages = require('./services/auto-shortages.service.js');
    const result = await autoShortages.runAutoShortages(0);
    console.log('[CRON-AUTO-SHORTAGES] Verificação concluída:', result);
  } catch (err) {
    console.error('[CRON-AUTO-SHORTAGES] Erro ao executar rotina:', err.message);
  }
}, { timezone: 'America/Sao_Paulo' });
console.log('[CRON-AUTO-SHORTAGES] 🤖 Robô de faltas automáticas agendado para rodar às 23:30 diariamente.');

// ─────────────────────────────────────────────────────────────────────────────
// COMPARADOR DE COTAÇÕES — /api/quotation/analyze
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/quotation/analyze', async (req, res) => {
  try {
    const { suppliers } = req.body;
    const { callAI } = require('./services/ai.service');

    if (!suppliers || !Array.isArray(suppliers) || suppliers.length < 2) {
      return res.status(400).json({ error: 'Envie ao menos 2 fornecedores com nome e texto.' });
    }

    // Monta o prompt com todos os fornecedores
    const supplierBlocks = suppliers
      .filter(s => s.name && s.text)
      .map((s, i) => `=== FORNECEDOR ${i + 1}: ${s.name} (id: ${s.id}) ===\n${s.text}`)
      .join('\n\n');

    const fullPrompt = `Você é um especialista em análise de cotações para farmácias brasileiras.
Extraia os dados de forma estruturada. 

REGRAS:
1. Extraia SOMENTE itens com preço (ex: R$ 3,50 ou 3.50)
2. Para descontos, coloque a condição em "condition"
3. Nomes MAIÚSCULOS. Preserve IDs.

VOCÊ DEVE RESPONDER ESTRITAMENTE COM UM JSON VÁLIDO. NÃO USE MARKDOWN (\`\`\`). INICIE DIRETAMENTE COM { e TERMINE COM }. NOMEIE A CHAVE RAIZ COMO "suppliers".

FORMATO ESPERADO:
{
  "suppliers": [
    {
      "id": "1",
      "name": "Nome",
      "products": [{"name": "PRODUTO", "price": 10.50, "condition": null, "validity": null, "rawLine": "original"}]
    }
  ]
}

COTAÇÕES:
${supplierBlocks}`;

    console.log(`[QUOTATION] Analisando cotações com o provedor central de IA...`);
    const rawText = await callAI(fullPrompt, "Você é um especialista em análise de cotações. Responda estritamente em JSON.", { temperature: 0.1 });
    
    if (!rawText) {
      throw new Error('A IA retornou uma resposta vazia.');
    }

    // Tenta extrair o JSON de forma robusta
    let analysis;
    try {
      let jsonText = rawText.trim();
      const startIndex = jsonText.indexOf('{');
      const endIndex = jsonText.lastIndexOf('}');
      
      if (startIndex !== -1 && endIndex !== -1 && endIndex >= startIndex) {
          jsonText = jsonText.substring(startIndex, endIndex + 1);
      }
      analysis = JSON.parse(jsonText);
    } catch (parseErr) {
      console.error('[QUOTATION] Falha ao parsear JSON da IA:', parseErr.message);
      return res.status(500).json({ error: 'A IA não retornou um JSON estruturado válido.', raw: rawText });
    }

    res.json(analysis);

  } catch (err) {
    console.error('[QUOTATION] Erro na análise:', err.message);
    res.status(500).json({ error: `Erro na análise de IA: ${err.message}` });
  }
});

app.get('/api/run-5-days', async (req, res) => {
  try {
    const autoShortages = require('./services/auto-shortages.service.js');
    const result = await autoShortages.runAutoShortages(5);
    res.json({ success: true, message: 'Pesquisa dos últimos 5 dias concluída!', result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// ══════════════════════════════════════════════════════════════════════
// 🤖 BAILEYS WHATSAPP SERVICE — Inicialização e Endpoints
// ══════════════════════════════════════════════════════════════════════
let baileys = null;
try {
  baileys = require('./baileys-service.js');
  console.log('[Baileys] 🚀 Iniciando conexão WhatsApp em background...');
  baileys.connect(db).catch(err => {
    console.error('[Baileys] ⚠️ Falha na inicialização (continuando sem Baileys):', err.message);
  });
} catch (e) {
  console.warn('[Baileys] ⚠️ Serviço indisponível (arquivo não encontrado):', e.message);
}

// GET /api/whatsapp/baileys/status — Status da conexão
app.get('/api/whatsapp/baileys/status', (req, res) => {
  if (!baileys) return res.json({ connected: false, error: 'Serviço Baileys não carregado.' });
  res.json(baileys.getStatus());
});

// GET /api/whatsapp/baileys/qrcode — Retorna o QR Code atual (base64)
app.get('/api/whatsapp/baileys/qrcode', (req, res) => {
  if (!baileys) return res.status(503).json({ error: 'Serviço Baileys não disponível.' });
  const status = baileys.getStatus();
  if (!status.hasQR) {
    return res.json({ hasQR: false, message: status.connected ? 'Já conectado!' : 'Aguardando QR Code...' });
  }
  res.json({ hasQR: true, qrCode: status.qrCode });
});

// POST /api/whatsapp/baileys/reconnect — Força reconexão/novo QR
app.post('/api/whatsapp/baileys/reconnect', async (req, res) => {
  if (!baileys) return res.status(503).json({ error: 'Serviço Baileys não disponível.' });
  try {
    await baileys.disconnect();
    await new Promise(r => setTimeout(r, 1000));
    baileys.connect(db).catch(e => console.error('[Baileys] Erro ao reconectar:', e.message));
    res.json({ success: true, message: 'Reconexão iniciada! Aguarde o QR Code.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/whatsapp/baileys/groups — Lista grupos que o número participa
app.get('/api/whatsapp/baileys/groups', async (req, res) => {
  if (!baileys) return res.status(503).json({ error: 'Serviço Baileys não disponível.' });
  try {
    const groups = await baileys.listGroups();
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// 🤖 BAILEYS WHATSAPP SECONDARY SERVICE — Inicialização e Endpoints
// ══════════════════════════════════════════════════════════════════════
let baileysSecondary = null;
try {
  baileysSecondary = require('./baileys-secondary-service.js');
  console.log('[Baileys-Secondary] 🚀 Iniciando conexão WhatsApp Secundário em background...');
  baileysSecondary.connect(db).catch(err => {
    console.error('[Baileys-Secondary] ⚠️ Falha na inicialização do secundário:', err.message);
  });
} catch (e) {
  console.warn('[Baileys-Secondary] ⚠️ Serviço secundário indisponível:', e.message);
}

// GET /api/whatsapp/secondary/status — Status da conexão
app.get('/api/whatsapp/secondary/status', (req, res) => {
  if (!baileysSecondary) return res.json({ connected: false, error: 'Serviço Baileys Secundário não carregado.' });
  res.json(baileysSecondary.getStatus());
});

// GET /api/whatsapp/secondary/qrcode — Retorna o QR Code atual (base64)
app.get('/api/whatsapp/secondary/qrcode', (req, res) => {
  if (!baileysSecondary) return res.status(503).json({ error: 'Serviço Baileys Secundário não disponível.' });
  const status = baileysSecondary.getStatus();
  if (!status.hasQR) {
    return res.json({ hasQR: false, message: status.connected ? 'Já conectado!' : 'Aguardando QR Code...' });
  }
  res.json({ hasQR: true, qrCode: status.qrCode });
});

// POST /api/whatsapp/secondary/reconnect — Força reconexão/novo QR
app.post('/api/whatsapp/secondary/reconnect', async (req, res) => {
  if (!baileysSecondary) return res.status(503).json({ error: 'Serviço Baileys Secundário não disponível.' });
  try {
    await baileysSecondary.disconnect();
    await new Promise(r => setTimeout(r, 1000));
    baileysSecondary.connect(db).catch(e => console.error('[Baileys-Secondary] Erro ao reconectar:', e.message));
    res.json({ success: true, message: 'Reconexão do secundário iniciada! Aguarde o QR Code.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/secondary/send-text — Envio de mensagem de texto (manual/automático)
app.post('/api/whatsapp/secondary/send-text', async (req, res) => {
  if (!baileysSecondary) return res.status(503).json({ error: 'Serviço Baileys Secundário não disponível.' });
  const { to, text } = req.body;
  if (!to || !text) {
    return res.status(400).json({ error: 'Parâmetros "to" (número ou grupo) e "text" são obrigatórios.' });
  }
  try {
    const result = await baileysSecondary.sendTextToGroup(to, text);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/secondary/send-media — Envio de imagem
app.post('/api/whatsapp/secondary/send-media', async (req, res) => {
  if (!baileysSecondary) return res.status(503).json({ error: 'Serviço Baileys Secundário não disponível.' });
  const { to, caption, imagePath } = req.body;
  if (!to || !imagePath) {
    return res.status(400).json({ error: 'Parâmetros "to" e "imagePath" são obrigatórios.' });
  }
  try {
    const result = await baileysSecondary.sendImageToGroup(to, imagePath, caption);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/whatsapp/secondary/groups — Lista grupos do WhatsApp Secundário
app.get('/api/whatsapp/secondary/groups', async (req, res) => {
  if (!baileysSecondary) return res.status(503).json({ error: 'Serviço Baileys Secundário não disponível.' });
  try {
    const groups = await baileysSecondary.listGroups();
    res.json(groups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// 🏷️ MÓDULO DE EMISSÃO DE ETIQUETAS E CATÁLOGO DE ESTOQUE
// ══════════════════════════════════════════════════════════════════════
const PdfParserService = require('./services/pdf-parser.service.js');
const pdfParser = new PdfParserService(db);

// GET /api/labels/queue - Retorna todas as etiquetas na fila
app.get('/api/labels/queue', (req, res) => {
  try {
    const queue = db.prepare('SELECT * FROM label_print_queue ORDER BY created_at DESC').all();
    res.json(queue);
  } catch (err) {
    console.error('[SERVER-LABELS] Erro ao listar fila:', err.message);
    res.status(500).json({ error: 'Erro ao listar fila de etiquetas.' });
  }
});

// POST /api/labels/queue - Cria etiqueta manualmente
app.post('/api/labels/queue', (req, res) => {
  const { productName, price, originalPrice, barcode, quantity } = req.body;
  if (!productName || !price) {
    return res.status(400).json({ error: 'Nome do produto e Preço de venda são obrigatórios.' });
  }
  
  try {
    const id = `label_${Date.now()}`;
    const stmt = db.prepare(`
      INSERT INTO label_print_queue (id, product_name, price, original_price, barcode, quantity, status, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      productName,
      parseFloat(price),
      originalPrice ? parseFloat(originalPrice) : null,
      barcode || '',
      quantity ? parseInt(quantity, 10) : 1,
      'Pendente',
      'web',
      new Date().toISOString()
    );
    
    res.status(201).json({ success: true, message: 'Etiqueta criada com sucesso.', id });
  } catch (err) {
    console.error('[SERVER-LABELS] Erro ao criar etiqueta manualmente:', err.message);
    res.status(500).json({ error: 'Erro ao salvar etiqueta.' });
  }
});

// PUT /api/labels/queue/:id - Edita etiqueta
app.put('/api/labels/queue/:id', (req, res) => {
  const { id } = req.params;
  const { product_name, price, original_price, barcode, quantity, status } = req.body;
  
  try {
    const stmt = db.prepare(`
      UPDATE label_print_queue 
      SET product_name = ?, price = ?, original_price = ?, barcode = ?, quantity = ?, status = ?
      WHERE id = ?
    `);
    
    const result = stmt.run(
      product_name,
      parseFloat(price),
      original_price ? parseFloat(original_price) : null,
      barcode || '',
      parseInt(quantity, 10) || 1,
      status || 'Pendente',
      id
    );
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Etiqueta não encontrada.' });
    }
    
    res.json({ success: true, message: 'Etiqueta atualizada com sucesso.' });
  } catch (err) {
    console.error('[SERVER-LABELS] Erro ao atualizar etiqueta:', err.message);
    res.status(500).json({ error: 'Erro ao atualizar etiqueta.' });
  }
});

// DELETE /api/labels/queue/:id - Remove etiqueta da fila
app.delete('/api/labels/queue/:id', (req, res) => {
  const { id } = req.params;
  try {
    const stmt = db.prepare('DELETE FROM label_print_queue WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Etiqueta não encontrada.' });
    }
    res.json({ success: true, message: 'Etiqueta removida com sucesso.' });
  } catch (err) {
    console.error('[SERVER-LABELS] Erro ao deletar etiqueta:', err.message);
    res.status(500).json({ error: 'Erro ao remover etiqueta.' });
  }
});

// POST /api/labels/print-batch - Marca lote como impresso
app.post('/api/labels/print-batch', (req, res) => {
  const { ids } = req.body; // Array de IDs
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'IDs das etiquetas impressas são necessários.' });
  }
  
  try {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE label_print_queue 
      SET status = 'Impresso', printed_at = ? 
      WHERE id = ?
    `);
    
    const transaction = db.transaction((labelIds) => {
      let count = 0;
      for (const id of labelIds) {
        const result = stmt.run(now, id);
        count += result.changes;
      }
      return count;
    });
    
    const updatedCount = transaction(ids);
    res.json({ success: true, message: `${updatedCount} etiquetas marcadas como impressas.` });
  } catch (err) {
    console.error('[SERVER-LABELS] Erro ao processar lote impresso:', err.message);
    res.status(500).json({ error: 'Erro ao marcar etiquetas como impressas.' });
  }
});

// POST /api/labels/upload-stock-pdf - Recebe PDF e atualiza catálogo stock_products
app.post('/api/labels/upload-stock-pdf', upload.single('stockPdf'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo PDF enviado.' });
  }

  console.log(`[SERVER-LABELS] Recebido PDF de estoque: ${req.file.originalname} -> ${req.file.path}`);
  
  try {
    const importedCount = await pdfParser.importStockFromPdf(req.file.path);
    
    // Limpa o arquivo temporário após o processamento bem sucedido
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    
    res.json({ 
      success: true, 
      message: `Estoque atualizado com sucesso! ${importedCount} produtos importados do PDF.` 
    });
  } catch (err) {
    console.error('[SERVER-LABELS] Erro catastrófico na importação do PDF:', err.message);
    // Limpa o arquivo mesmo se der erro
    try { if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch (e) {}
    
    res.status(500).json({ 
      error: `Erro ao processar o relatório de estoque em PDF: ${err.message}` 
    });
  }
});

// GET /api/labels/stock - Busca produtos no catálogo do estoque (para autocomplete no manual)
app.get('/api/labels/stock', (req, res) => {
  const { q } = req.query;
  try {
    let products = [];
    if (q && q.length >= 2) {
      products = db.prepare(`
        SELECT * FROM stock_products 
        WHERE name LIKE ? OR code = ?
        ORDER BY name LIMIT 50
      `).all(`%${q}%`, q);
    } else {
      products = db.prepare('SELECT * FROM stock_products ORDER BY name LIMIT 50').all();
    }
    res.json(products);
  } catch (err) {
    console.error('[SERVER-LABELS] Erro ao buscar estoque:', err.message);
    res.status(500).json({ error: 'Erro ao buscar catálogo de produtos.' });
  }
});

// Rota de diagnóstico temporária para testar conexão com o Digifarma de dentro da VPS
app.get('/api/test-digifarma-vps', async (req, res) => {
  try {
    const results = await queryDigifarma("SELECT FIRST 3 PRODUTO, PROD_SALDO FROM PRODUTOS");
    res.json({
      success: true,
      message: "Conexão com o Digifarma realizada com sucesso de dentro da VPS!",
      data: results
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "FALHA na conexão com o Digifarma de dentro da VPS!",
      error: err.message,
      stack: err.stack
    });
  }
});

// Rota de diagnóstico avançado das faltas para testar individualmente cada item
app.get('/api/debug-shortages', async (req, res) => {
  try {
    const shortagesList = db.prepare("SELECT * FROM shortages WHERE purchased = 0").all();
    if (shortagesList.length === 0) {
      return res.json({ success: true, message: "Nenhum produto em falta (não comprado) no banco SQLite local." });
    }
    
    const report = [];
    for (const item of shortagesList) {
      const name = item.productName ? item.productName.trim().toUpperCase() : '';
      if (!name) continue;
      
      const start = Date.now();
      try {
        const sql = `
          SELECT p.PRODUTO, p.PROD_SALDO, COALESCE(p.PROD_PRCOMPRA, p.VALOR_ULT_COMPRA, 0) as PROD_PRCOMPRA
          FROM PRODUTOS p
          WHERE p.PRODUTO = ?
        `;
        const queryRes = await queryDigifarma(sql, [name]);
        report.push({
          productName: item.productName,
          cleanedName: name,
          success: true,
          timeMs: Date.now() - start,
          found: queryRes.length > 0,
          data: queryRes
        });
      } catch (err) {
        report.push({
          productName: item.productName,
          cleanedName: name,
          success: false,
          timeMs: Date.now() - start,
          error: err.message
        });
      }
    }
    
    res.json({
      success: true,
      totalItems: shortagesList.length,
      report
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
      stack: err.stack
    });
  }
});

// Nodemon trigger restart


