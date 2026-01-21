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

    res.json({
      users: { documents: users },
      orders: { documents: orders },
      shortages: { documents: shortages },
      logs: { documents: logs },
      cashClosings: { documents: cashClosings },
      boletos: { documents: boletos },
      monthlyLimits: { documents: monthlyLimits },
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
      // 1. Delete existing boletos for this order
      deleteStmt.run(order_id);

      // 2. Insert new boletos
      for (const boleto of boletos) {
        insertStmt.run({
          ...boleto,
          order_id: order_id, // Ensure order_id is set from the URL param
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
app.post('/api/boletos', upload.single('boletoFile'), (req, res) => {
  try {
    const boleto = req.body;
    if (req.file) {
      boleto.boletoPath = req.file.path;
    }
    const stmt = db.prepare(`
      INSERT INTO boletos (id, order_id, due_date, value, status, installment_number, invoice_number, boletoPath)
      VALUES (@id, @order_id, @due_date, @value, @status, @installment_number, @invoice_number, @boletoPath)
    `);
    const result = stmt.run(boleto);
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error('Error creating boleto:', err);
    res.status(500).json({ error: 'Failed to create boleto.' });
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

    db.transaction(() => {
      insertClosingStmt.run({
        ...closing,
        crediarioList: JSON.stringify(closing.crediarioList || [])
      });

      const transactionDate = new Date().toISOString();
      
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
  const { id, title, description, assignedUser, creator, priority, status, dueDate, creationDate, color } = req.body;

  // Basic validation
  if (!id || !title || !assignedUser || !creator || !priority || !status || !dueDate || !creationDate || !color) {
    return res.status(400).json({ error: 'Missing required task fields.' });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO tasks (id, title, description, assignedUser, creator, priority, status, dueDate, creationDate, color, isArchived, completionDate)
      VALUES (@id, @title, @description, @assignedUser, @creator, @priority, @status, @dueDate, @creationDate, @color, 0, NULL)
    `);
    const result = stmt.run({ id, title, description, assignedUser, creator, priority, status, dueDate, creationDate, color });
    res.status(201).json({ id: result.lastInsertRowid });
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(500).json({ error: 'Failed to create task.' });
  }
});

// GET all tasks (with RBAC)
app.get('/api/tasks', (req, res) => {
  const { userId, userRole } = req.query; // Assuming user info is passed in query for now

  if (!userId || !userRole) {
    return res.status(401).json({ error: 'Authentication required for task access.' });
  }

  let query = 'SELECT * FROM tasks';
  let params = [];

  if (userRole !== 'Administrador') { // Assuming 'Administrador' is the admin role
    query += ' WHERE assignedUser = ? OR assignedUser = "all_users" OR creator = ?';
    params.push(userId, userId);
  }
  query += ' ORDER BY creationDate DESC';

  try {
    const tasks = db.prepare(query).all(params);
    res.json(tasks);
  } catch (err) {
    console.error('Error fetching tasks:', err);
    res.status(500).json({ error: 'Failed to fetch tasks.' });
  }
});

// GET a single task (with RBAC)
app.get('/api/tasks/:id', (req, res) => {
  const taskId = req.params.id;
  const { userId, userRole } = req.query; // Assuming user info is passed in query for now

  if (!userId || !userRole) {
    return res.status(401).json({ error: 'Authentication required for task access.' });
  }

  try {
    const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
    const task = stmt.get(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    // RBAC Check
    if (userRole !== 'Administrador') {
      if (task.assignedUser !== userId && task.assignedUser !== 'all_users') {
        return res.status(403).json({ error: 'Access denied to this task.' });
      }
    }
    
    res.json(task);
  } catch (err) {
    console.error('Error fetching task:', err);
    res.status(500).json({ error: 'Failed to fetch task.' });
  }
});

// UPDATE Task (with RBAC)
app.put('/api/tasks/:id', (req, res) => {
  const taskId = req.params.id;
  const { userId, userRole } = req.query; // Assuming user info is passed in query for now
  const { title, description, assignedUser, priority, status, dueDate, color, isArchived } = req.body;

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
          completionDate = @completionDate
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
app.delete('/api/tasks/:id', (req, res) => {
  const taskId = req.params.id;
  const { userId, userRole } = req.query; // Assuming user info is passed in query for now

  if (!userId || !userRole) {
    return res.status(401).json({ error: 'Authentication required for task deletion.' });
  }

  // RBAC Check - Only admin can delete tasks
  if (userRole !== 'Administrador') {
    return res.status(403).json({ error: 'Access denied. Only administrators can delete tasks.' });
  }

  try {
    const stmt = db.prepare('DELETE FROM tasks WHERE id = ?');
    const result = stmt.run(taskId);

    if (result.changes > 0) {
      res.status(200).json({ message: 'Task deleted successfully.' });
    } else {
      res.status(404).json({ error: 'Task not found.' });
    }
  } catch (err) {
    console.error('Error deleting task:', err);
    res.status(500).json({ error: 'Failed to delete task.' });
  }
});

// GET Dashboard Metrics (Admin only)
app.get('/api/tasks/dashboard-metrics', (req, res) => {
  const { userRole } = req.query; // Assuming user info is passed in query for now

  if (userRole !== 'Administrador') {
    return res.status(403).json({ error: 'Access denied. Only administrators can view task dashboard metrics.' });
  }

  try {
    const totalTasks = db.prepare('SELECT COUNT(*) AS count FROM tasks').get().count;
    const completedTasks = db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE status = "Concluída"').get().count;
    const inProgressTasks = db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE status = "Em Progresso"').get().count;
    const overdueTasks = db.prepare('SELECT COUNT(*) AS count FROM tasks WHERE dueDate < ? AND status != "Concluída" AND status != "Cancelada"').get(new Date().toISOString()).count;

    const tasksByPriority = db.prepare('SELECT priority, COUNT(*) AS count FROM tasks GROUP BY priority').all();
    const tasksByStatus = db.prepare('SELECT status, COUNT(*) AS count FROM tasks GROUP BY status').all();

    res.json({
      totalTasks,
      completedTasks,
      inProgressTasks,
      overdueTasks,
      tasksByPriority,
      tasksByStatus,
    });
  } catch (err) {
    console.error('Error fetching task dashboard metrics:', err);
    res.status(500).json({ error: 'Failed to fetch task dashboard metrics.' });
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
