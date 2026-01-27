const express = require('express');
const cors = require('cors');
const db = require('./database.js');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;

// Middlewares
app.use(cors());
app.use(express.json());

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
      installments: order.installments ? JSON.parse(order.installments) : [],
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
        expenses: JSON.parse(record.expenses),
        nonRegistered: JSON.parse(record.nonRegistered),
        pixDiretoList: record.pixDiretoList ? JSON.parse(record.pixDiretoList) : [],
        crediarioList: record.crediarioList ? JSON.parse(record.crediarioList) : [],
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
      expenses: JSON.parse(record.expenses),
      nonRegistered: JSON.parse(record.nonRegistered),
      pixDiretoList: record.pixDiretoList ? JSON.parse(record.pixDiretoList) : [],
      crediarioList: record.crediarioList ? JSON.parse(record.crediarioList) : [],
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
      INSERT INTO daily_records (id, date, expenses, nonRegistered, pixDiretoList, crediarioList, userName, lancado)
      VALUES (@id, @date, @expenses, @nonRegistered, @pixDiretoList, @crediarioList, @userName, 0)
    `);
    const result = stmt.run({
      ...record,
      expenses: JSON.stringify(record.expenses || []),
      nonRegistered: JSON.stringify(record.nonRegistered || []),
      pixDiretoList: JSON.stringify(record.pixDiretoList || []),
      crediarioList: JSON.stringify(record.crediarioList || []),
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
    const closings = db.prepare('SELECT * FROM cash_closings ORDER BY date DESC').all();
    res.json(closings);
  } catch (err) {
    console.error('Error fetching cash closings:', err);
    res.status(500).json({ error: 'Failed to fetch cash closings.' });
  }
});

// CREATE cash closing
app.post('/api/cash-closings', (req, res) => {
  try {
    const closing = req.body;
    console.log('Received closing data:', closing); // Debugging line
    const insertClosingStmt = db.prepare(`
      INSERT INTO cash_closings (id, date, totalSales, initialCash, receivedExtra, totalDigital, totalInDrawer, difference, safeDeposit, expenses, userName, credit, debit, pix, pixDirect, totalCrediario, crediarioList)
      VALUES (@id, @date, @totalSales, @initialCash, @receivedExtra, @totalDigital, @totalInDrawer, @difference, @safeDeposit, @expenses, @userName, @credit, @debit, @pix, @pixDirect, @totalCrediario, @crediarioList)
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
        crediarioList: JSON.stringify(closing.crediarioList || [])
      });

      const transactionDate = new Date().toISOString();
      
      // If there is a safe deposit, record it in the safe
      if (closing.safeDeposit > 0) {
        insertSafeEntryStmt.run({
          id: 'S' + Date.now().toString(),
          date: transactionDate,
          description: `Depósito Fechamento de Caixa`,
          type: 'Entrada',
          value: closing.safeDeposit,
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
            daysOfWeek: (task.recurrenceDaysOfWeek && typeof task.recurrenceDaysOfWeek === 'string') ? JSON.parse(task.recurrenceDaysOfWeek) : undefined,
            dayOfMonth: task.recurrenceDayOfMonth,
            monthOfYear: task.recurrenceMonthOfYear,
            endDate: task.recurrenceEndDate,
          } : undefined,
          annotations: (task.annotations && typeof task.annotations === 'string') ? JSON.parse(task.annotations) : [],
          needsAdminAttention: !!task.needsAdminAttention, // Convert 0/1 to boolean
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
        daysOfWeek: (task.recurrenceDaysOfWeek && typeof task.recurrenceDaysOfWeek === 'string') ? JSON.parse(task.recurrenceDaysOfWeek) : undefined,
        dayOfMonth: task.recurrenceDayOfMonth,
        monthOfYear: task.recurrenceMonthOfYear,
        endDate: task.recurrenceEndDate,
      } : undefined,
      annotations: (task.annotations && typeof task.annotations === 'string') ? JSON.parse(task.annotations) : [],
      needsAdminAttention: !!task.needsAdminAttention,
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
    recurrence, originalDueDate, annotations, needsAdminAttention, adminAttentionMessage
  } = req.body;

  if (!userId || !userRole) {
    return res.status(401).json({ error: 'Authentication required for task update.' });
  }

  try {
    const existingTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);

    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    // RBAC Check - Only admin can update any task. Operators can only update their assigned tasks.
    if (userRole !== 'Administrador') {
      if (existingTask.assignedUser !== userId && existingTask.assignedUser !== 'all_users') {
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
          adminAttentionMessage = @adminAttentionMessage
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

    let annotations = existingTask.annotations ? JSON.parse(existingTask.annotations) : [];
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


app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
