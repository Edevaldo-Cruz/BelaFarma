module.exports = function(app, db) {
  // === SUPPLIERS ===
  app.get('/api/consignado/suppliers', (req, res) => {
    try {
      const suppliers = db.prepare('SELECT * FROM consignado_suppliers ORDER BY name').all();
      // Calculate debts for each supplier
      const suppliersWithStats = suppliers.map(s => {
        const products = db.prepare('SELECT * FROM consignado_products WHERE supplierId = ?').all(s.id);
        const totalDebt = products.reduce((acc, p) => acc + (p.soldQty * p.costPrice), 0);
        const totalStockValue = products.reduce((acc, p) => acc + (p.currentStock * p.salePrice), 0); // Valor de venda em estoque
        return { ...s, totalDebt, totalStockValue, productCount: products.length };
      });
      res.json(suppliersWithStats);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/consignado/suppliers', (req, res) => {
    try {
      const { name, contact, pixKey } = req.body;
      const id = 'cons_sup_' + Date.now();
      const createdAt = new Date().toISOString();
      db.prepare('INSERT INTO consignado_suppliers (id, name, contact, pixKey, createdAt) VALUES (?, ?, ?, ?, ?)').run(id, name, contact || '', pixKey || '', createdAt);
      res.status(201).json({ id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/consignado/suppliers/:id', (req, res) => {
      try {
          db.prepare('DELETE FROM consignado_suppliers WHERE id = ?').run(req.params.id);
          res.json({ success: true });
      } catch(err) {
          res.status(500).json({ error: err.message });
      }
  });

  // === PRODUCTS ===
  app.get('/api/consignado/products/:supplierId', (req, res) => {
    try {
      const products = db.prepare('SELECT * FROM consignado_products WHERE supplierId = ?').all(req.params.supplierId);
      res.json(products);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/consignado/products', (req, res) => {
    try {
      const { supplierId, name, costPrice, salePrice, initialQty } = req.body;
      const id = 'cons_prod_' + Date.now();
      db.prepare(`
        INSERT INTO consignado_products (id, supplierId, name, costPrice, salePrice, currentStock, soldQty, status)
        VALUES (?, ?, ?, ?, ?, ?, 0, 'Ativo')
      `).run(id, supplierId, name, costPrice, salePrice, initialQty);
      res.status(201).json({ id });
    } catch (err) {
        console.error(err);
      res.status(500).json({ error: err.message });
    }
  });
  
  app.delete('/api/consignado/products/:id', (req, res) => {
      try {
          db.prepare('DELETE FROM consignado_products WHERE id = ?').run(req.params.id);
          res.json({ success: true });
      } catch(err) {
          res.status(500).json({ error: err.message });
      }
  });

  // Update Stock/Sold Qty (Acerto Manual)
  app.put('/api/consignado/products/:id', (req, res) => {
      try {
          const { currentStock, soldQty, costPrice, salePrice, name } = req.body;
          const updates = [];
          const params = [];

          if (currentStock !== undefined) { updates.push('currentStock = ?'); params.push(currentStock); }
          if (soldQty !== undefined) { updates.push('soldQty = ?'); params.push(soldQty); }
          if (costPrice !== undefined) { updates.push('costPrice = ?'); params.push(costPrice); }
          if (salePrice !== undefined) { updates.push('salePrice = ?'); params.push(salePrice); }
          if (name !== undefined) { updates.push('name = ?'); params.push(name); }

          params.push(req.params.id);
          
          if (updates.length > 0) {
            db.prepare(`UPDATE consignado_products SET ${updates.join(', ')} WHERE id = ?`).run(...params);
          }
          res.json({ success: true });
      } catch(err) {
          res.status(500).json({ error: err.message });
      }
  });
  
  // Register Payment (Zerar vendidos)
  app.post('/api/consignado/payment-process', (req, res) => {
      try {
          const { supplierId } = req.body;
          console.log(`[CONSIGNADO] Processando zeramento para fornecedor ${supplierId}`);
          
          // Zera soldQty dos produtos do fornecedor (simulando acerto total)
          // Em uma versão futura, podemos abater parcialmente, mas por simplicidade: pagou = zerou pendências.
          const info = db.prepare('UPDATE consignado_products SET soldQty = 0 WHERE supplierId = ?').run(supplierId);
          
          console.log(`[CONSIGNADO] Atualizados ${info.changes} produtos.`);
          res.json({ success: true, changes: info.changes });
          
      } catch(err) {
          console.error(err);
          res.status(500).json({ error: err.message });
      }
  });
  // Register Sale (Baixa de Estoque Automática)
  app.post('/api/consignado/sales', (req, res) => {
    try {
      const { products } = req.body; // Array of { id, qty }
      
      const updateStmt = db.prepare('UPDATE consignado_products SET currentStock = currentStock - ?, soldQty = soldQty + ? WHERE id = ?');
      
      const transaction = db.transaction((items) => {
        for (const item of items) {
          if (item.qty > 0) {
             updateStmt.run(item.qty, item.qty, item.id);
          }
        }
      });
      
      transaction(products);
      
      res.json({ success: true, count: products.length });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // Get All Products for Dropdown
  app.get('/api/consignado/all-products', (req, res) => {
    try {
        const prod = db.prepare(`
            SELECT p.*, s.name as supplierName 
            FROM consignado_products p 
            JOIN consignado_suppliers s ON p.supplierId = s.id 
            WHERE p.status = 'Ativo'
            ORDER BY p.name ASC
        `).all();
        res.json(prod);
    } catch(err) {
        res.status(500).json({ error: err.message });
    }
  });
};
