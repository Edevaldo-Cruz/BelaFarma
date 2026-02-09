const express = require('express');
const cors = require('cors');
let db = require('./database.js');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.json());

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
  // Define backup directory within the persistent data volume
  // In Docker: /usr/src/app/data/backups
  // In Dev: ../data/backups relative to server.js
  const backupDir = path.join(__dirname, process.platform === 'win32' ? '../backups_dev_simulated' : '../data/backups');

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
  const backupDir = path.join(__dirname, process.platform === 'win32' ? '../backups_dev_simulated' : '../data/backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const filename = `belafarma_${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
  const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/belafarma.db');

  console.log(`Creating backup... Source: ${dbPath}, Dest: ${path.join(backupDir, filename)}`);

  try {
    // Determine source DB path correctly based on environment
    let sourcePath = dbPath;
    if (process.platform === 'win32') {
        sourcePath = path.join(__dirname, 'belafarma.db'); // In dev, we often use local db
    }

    // Verify source exists
    if (!fs.existsSync(sourcePath)) {
        // Fallback for Docker if env var not set correctly
        const dockerDbPath = path.join(__dirname, '../data/belafarma.db');
        if (fs.existsSync(dockerDbPath)) {
            sourcePath = dockerDbPath;
        } else {
             throw new Error(`Source database not found at ${sourcePath}`);
        }
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
  const backupDir = path.join(__dirname, process.platform === 'win32' ? '../backups_dev_simulated' : '../data/backups');
  const backupPath = path.join(backupDir, filename);

  // Determine source DB path (target for restore)
  let targetPath = process.env.DB_PATH || path.join(__dirname, 'belafarma.db');
  if (process.platform === 'win32') {
     targetPath = path.join(__dirname, 'belafarma.db');
  } else {
     // Docker fallback
      if (!fs.existsSync(targetPath)) {
        targetPath = path.join(__dirname, '../data/belafarma.db');
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

const upload = multer({ storage: storage });

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
    }));

    const shortages = shortagesRaw.map(shortage => ({
      ...shortage,
      clientInquiry: !!shortage.clientInquiry, // Convert 0/1 back to false/true
    }));
    
    const cashClosings = db.prepare('SELECT * FROM cash_closings ORDER BY date DESC').all();
    const boletos = db.prepare('SELECT * FROM boletos ORDER BY due_date').all();
    const monthlyLimits = db.prepare('SELECT * FROM monthly_limits').all();
    const dailyRecords = db.prepare('SELECT * FROM daily_records ORDER BY date DESC').all().map(record => {
      const mapped = {
        ...record,
        expenses: safelyParseJSON(record.expenses),
        nonRegistered: safelyParseJSON(record.nonRegistered),
        pixDiretoList: safelyParseJSON(record.pixDiretoList),
        crediarioList: safelyParseJSON(record.crediarioList),
        creditReceipts: safelyParseJSON(record.creditReceipts),
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
    res.status(201).json({ message: 'Fixed account created successfully.' });
  } catch (err) {
    console.error('Error creating fixed account:', err);
    res.status(500).json({ error: 'Failed to create fixed account.' });
  }
});

app.put('/api/fixed-accounts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, value, dueDay, isActive } = req.body;
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
      res.status(200).json({ message: 'Fixed account updated successfully.' });
    } else {
      res.status(404).json({ error: 'Fixed account not found.' });
    }
  } catch (err) {
    console.error('Error updating fixed account:', err);
    res.status(500).json({ error: 'Failed to update fixed account.' });
  }
});

app.delete('/api/fixed-accounts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM fixed_accounts WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes > 0) {
      res.status(200).json({ message: 'Fixed account deleted successfully.' });
    } else {
      res.status(404).json({ error: 'Fixed account not found.' });
    }
  } catch (err) {
    console.error('Error deleting fixed account:', err);
    res.status(500).json({ error: 'Failed to delete fixed account.' });
  }
});

// --- FIXED ACCOUNT PAYMENTS ENDPOINTS ---

// GET /api/fixed-account-payments - Get payments for a specific month (with auto-generation)
app.get('/api/fixed-account-payments', (req, res) => {
  try {
    const { month } = req.query; // Expected format: YYYY-MM
    
    if (!month) {
      return res.status(400).json({ error: 'Month parameter is required (format: YYYY-MM)' });
    }
    
    // 1. Check if payments already exist for this month
    let payments = db.prepare('SELECT * FROM fixed_account_payments WHERE month = ?').all(month);
    
    // 2. If no payments exist, generate them automatically from active fixed accounts
    if (payments.length === 0) {
      const activeAccounts = db.prepare('SELECT * FROM fixed_accounts WHERE isActive = 1').all();
      
      activeAccounts.forEach(acc => {
        const [year, monthNum] = month.split('-');
        const dueDay = String(acc.dueDay).padStart(2, '0');
        const dueDate = `${year}-${monthNum}-${dueDay}`;
        
        const payment = {
          id: `fap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          fixedAccountId: acc.id,
          fixedAccountName: acc.name,
          value: acc.value,
          dueDate,
          month,
          status: 'Pendente',
          paidAt: null,
          notes: null
        };
        
        db.prepare(`
          INSERT INTO fixed_account_payments 
          (id, fixedAccountId, fixedAccountName, value, dueDate, month, status, paidAt, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          payment.id,
          payment.fixedAccountId,
          payment.fixedAccountName,
          payment.value,
          payment.dueDate,
          payment.month,
          payment.status,
          payment.paidAt,
          payment.notes
        );
        
        payments.push(payment);
      });
      
      console.log(`Auto-generated ${payments.length} fixed account payments for ${month}`);
    }
    
    res.json(payments);
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
  try {
    const order = req.body;
    if (req.file) {
      order.boletoPath = req.file.path;
    }
    const stmt = db.prepare(`
      INSERT INTO orders (id, orderDate, distributor, seller, totalValue, arrivalForecast, status, paymentMonth, invoiceNumber, paymentMethod, receiptDate, notes, installments, boletoPath)
      VALUES (@id, @orderDate, @distributor, @seller, @totalValue, @arrivalForecast, @status, @paymentMonth, @invoiceNumber, @paymentMethod, @receiptDate, @notes, @installments, @boletoPath)
    `);
    const result = stmt.run({
      ...order,
      installments: JSON.stringify(order.installments || [])
    });
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ error: 'Failed to create order.' });
  }
});

// UPDATE Order
app.put('/api/orders/:id', upload.single('boletoFile'), (req, res) => {
  try {
    const { id } = req.params;
    const order = req.body;
    if (req.file) {
      order.boletoPath = req.file.path;
    }
    const stmt = db.prepare(`
      UPDATE orders 
      SET orderDate = @orderDate, distributor = @distributor, seller = @seller, totalValue = @totalValue, arrivalForecast = @arrivalForecast, status = @status, paymentMonth = @paymentMonth, invoiceNumber = @invoiceNumber, paymentMethod = @paymentMethod, receiptDate = @receiptDate, notes = @notes, installments = @installments, boletoPath = @boletoPath
      WHERE id = @id
    `);
    const result = stmt.run({
      id,
      ...order,
      installments: JSON.stringify(order.installments || [])
    });
    if (result.changes > 0) {
      res.status(200).json({ message: 'Order updated successfully.' });
    } else {
      res.status(404).json({ error: 'Order not found.' });
    }
  } catch (err) {
    console.error('Error updating order:', err);
    res.status(500).json({ error: 'Failed to update order.' });
  }
});

// DELETE Order
app.delete('/api/orders/:id', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM orders WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes > 0) {
      res.status(200).json({ message: 'Order deleted successfully.' });
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
      INSERT INTO shortages (id, productName, type, clientInquiry, notes, createdAt, userName)
      VALUES (@id, @productName, @type, @clientInquiry, @notes, @createdAt, @userName)
    `);
    const result = stmt.run({
      ...shortage,
      clientInquiry: shortage.clientInquiry ? 1 : 0, // Convert boolean to integer
    });
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error('Error creating shortage:', err);
    res.status(500).json({ error: 'Failed to create shortage.' });
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
// GET all boletos
app.get('/api/boletos', (req, res) => {
  try {
    const boletos = db.prepare('SELECT * FROM boletos ORDER BY due_date').all();
    res.json(boletos);
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
    INSERT INTO boletos (id, order_id, due_date, value, status, installment_number, invoice_number)
    VALUES (@id, @order_id, @due_date, @value, @status, @installment_number, @invoice_number)
  `);

  try {
    db.transaction(() => {
      deleteStmt.run(order_id);
      for (const boleto of boletos) {
        insertStmt.run({
          ...boleto,
          order_id: order_id,
        });
      }
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
    const result = stmt.run(boleto);
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
    
    const result = stmt.run({ id, supplierName, order_id, due_date, value, status, invoice_number });

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
      lancado: !!record.lancado, // Convert 0/1 to boolean
    }));
    res.json(records);
  } catch (err) {
    console.error('Error fetching daily records:', err);
    res.status(500).json({ error: 'Failed to fetch daily records.' });
  }
});

app.post('/api/daily-records', (req, res) => {
  try {
    const record = req.body;
    const stmt = db.prepare(`
      INSERT INTO daily_records (id, date, expenses, nonRegistered, pixDiretoList, crediarioList, creditReceipts, userName, lancado)
      VALUES (@id, @date, @expenses, @nonRegistered, @pixDiretoList, @crediarioList, @creditReceipts, @userName, 0)
    `);
    const result = stmt.run({
      ...record,
      expenses: JSON.stringify(record.expenses || []),
      nonRegistered: JSON.stringify(record.nonRegistered || []),
      pixDiretoList: JSON.stringify(record.pixDiretoList || []),
      crediarioList: JSON.stringify(record.crediarioList || []),
      creditReceipts: JSON.stringify(record.creditReceipts || []),
    });
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error('Error creating daily record:', err);
    res.status(500).json({ error: 'Failed to create daily record.' });
  }
});

// IMPORTANT: Specific routes must come before parameterized routes!
// This must be BEFORE app.put('/api/daily-records/:id') to avoid route conflicts
app.put('/api/daily-records/mark-processed', (req, res) => {
  try {
    const { recordIds } = req.body;
    console.log('=== Mark Daily Records as Processed ===');
    console.log('Record IDs to mark:', recordIds);
    
    if (!Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({ error: 'Missing recordIds.' });
    }

    const stmt = db.prepare(`
      UPDATE daily_records
      SET lancado = 1
      WHERE id IN (${recordIds.map(() => '?').join(',')})
    `);
    const result = stmt.run(...recordIds);

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
    });
    if (result.changes > 0) {
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
      INSERT INTO safe_entries (id, date, description, type, value, userName)
      VALUES (@id, @date, @description, @type, @value, @userName)
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
          userName: closing.userName
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
        // Calculate total of all safe deposits from cash closings
        const result = db.prepare(`
          SELECT SUM(safeDeposit) as total 
          FROM cash_closings 
          WHERE safeDeposit > 0
        `).get();
        
        const totalSafeDeposits = result?.total || 0;
        console.log(`[TASK AUTO] Total accumulated safe deposits: R$ ${totalSafeDeposits.toFixed(2)}`);
        
        if (totalSafeDeposits >= 1000) {
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

    res.status(201).json({ id: closing.id });
  } catch (err) {
    console.error('Error creating cash closing:', err);
    res.status(500).json({ error: 'Failed to create cash closing.', details: err.message });
  }
});

// --- Crediario Records CUD ---
// GET all crediario records
app.get('/api/crediario', (req, res) => {
  try {
    const records = db.prepare('SELECT * FROM crediario_records ORDER BY date DESC').all();
    res.json(records);
  } catch (err) {
    console.error('Error fetching crediario records:', err);
    res.status(500).json({ error: 'Failed to fetch crediario records.' });
  }
});

// CREATE crediario record
app.post('/api/crediario', (req, res) => {
  try {
    const record = req.body;
    const stmt = db.prepare(`
      INSERT INTO crediario_records (id, date, client, value, userName)
      VALUES (@id, @date, @client, @value, @userName)
    `);
    const result = stmt.run(record);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error('Error creating crediario record:', err);
    res.status(500).json({ error: 'Failed to create crediario record.' });
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
      INSERT INTO safe_entries (id, date, description, type, value, userName)
      VALUES (@id, @date, @description, @type, @value, @userName)
    `);
    stmt.run(entry);

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
      INSERT INTO customers (id, name, nickname, cpf, phone, email, address, notes, creditLimit, dueDay, createdAt, updatedAt)
      VALUES (@id, @name, @nickname, @cpf, @phone, @email, @address, @notes, @creditLimit, @dueDay, @createdAt, @updatedAt)
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
      createdAt: now,
      updatedAt: now,
    });
    res.status(201).json({ ...customer, creditLimit: customer.creditLimit || 0, dueDay: customer.dueDay || null, createdAt: now, updatedAt: now });
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
          email = @email, address = @address, notes = @notes, creditLimit = @creditLimit, dueDay = @dueDay, updatedAt = @updatedAt
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
            INSERT INTO daily_records (id, date, expenses, nonRegistered, pixDiretoList, crediarioList, creditReceipts, userName, lancado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
          `).run(id, date, JSON.stringify(expenses), JSON.stringify(nonRegistered), JSON.stringify(pixDiretoList), JSON.stringify(crediarioList), JSON.stringify(creditReceipts), debt.userName);
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
          INSERT INTO daily_records (id, date, expenses, nonRegistered, pixDiretoList, crediarioList, creditReceipts, userName, lancado)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).run(recordId, date, JSON.stringify(expenses), JSON.stringify(nonRegistered), JSON.stringify(pixDiretoList), JSON.stringify(crediarioList), JSON.stringify(creditReceipts), debt.userName);
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
// SISTEMA FOGUETE AMARELO - Inicialização dos Endpoints
// ============================================================================
const { initializeFogueteAmareloEndpoints } = require('./foguete-amarelo-endpoints.js');
const cron = require('node-cron');
const { exec } = require('child_process');


initializeFogueteAmareloEndpoints(app, db);
require('./consignado-endpoints.js')(app, db);

// Agendamento de Backup Automático (Diariamente à meia-noite)
cron.schedule('0 0 * * *', () => {
  console.log('[BACKUP AUTO] Iniciando rotina de backup diário...');
  const backupScript = path.join(__dirname, 'backup-script.js');
  
  exec(`node "${backupScript}"`, (error, stdout, stderr) => {
    if (error) {
      console.error(`[BACKUP AUTO] Erro ao executar script: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`[BACKUP AUTO] Stderr: ${stderr}`);
    }
    console.log(`[BACKUP AUTO] Resultado: ${stdout}`);
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log('📅 Sistema de backup automático agendado para 00:00 diariamente.');
});
