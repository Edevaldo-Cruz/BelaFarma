const express = require('express');
const cors = require('cors');
const db = require('./database.js');

const app = express();
const PORT = 3001;

// Middlewares
app.use(cors());
app.use(express.json());

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

    res.json({
      users: { documents: users },
      orders: { documents: orders },
      shortages: { documents: shortages },
      logs: { documents: logs },
    });
  } catch (err) {
    console.error('Error fetching all data:', err);
    res.status(500).json({ error: 'Failed to fetch data from the database.' });
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
app.post('/api/orders', (req, res) => {
  try {
    const order = req.body;
    const stmt = db.prepare(`
      INSERT INTO orders (id, orderDate, distributor, seller, totalValue, arrivalForecast, status, paymentMonth, invoiceNumber, paymentMethod, receiptDate, notes, installments)
      VALUES (@id, @orderDate, @distributor, @seller, @totalValue, @arrivalForecast, @status, @paymentMonth, @invoiceNumber, @paymentMethod, @receiptDate, @notes, @installments)
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
app.put('/api/orders/:id', (req, res) => {
  try {
    const { id } = req.params;
    const order = req.body;
    const stmt = db.prepare(`
      UPDATE orders 
      SET orderDate = @orderDate, distributor = @distributor, seller = @seller, totalValue = @totalValue, arrivalForecast = @arrivalForecast, status = @status, paymentMonth = @paymentMonth, invoiceNumber = @invoiceNumber, paymentMethod = @paymentMethod, receiptDate = @receiptDate, notes = @notes, installments = @installments
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


app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
