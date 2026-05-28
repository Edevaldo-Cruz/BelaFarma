const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const recipesDir = path.join(__dirname, 'uploads/recipes');

if (!fs.existsSync(recipesDir)) {
  fs.mkdirSync(recipesDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, recipesDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'recipe-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

module.exports = (db) => {
  
  // Get all recipes for a customer
  router.get('/customer/:customerId', (req, res) => {
    try {
      const recipes = db.prepare('SELECT * FROM customer_recipes WHERE customer_id = ? ORDER BY created_at DESC').all(req.params.customerId);
      res.json(recipes);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Upload new recipe
  router.post('/customer/:customerId/upload', upload.single('recipeImage'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo de receita enviado.' });
    }

    try {
      const customerId = req.params.customerId;
      const { doctor_name, medication_name, expiry_date } = req.body;
      const recipe_image_url = `/uploads/recipes/${req.file.filename}`;
      const id = Date.now().toString();
      const created_at = new Date().toISOString();

      const stmt = db.prepare(`
        INSERT INTO customer_recipes (id, customer_id, doctor_name, medication_name, recipe_image_url, expiry_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(id, customerId, doctor_name || null, medication_name || null, recipe_image_url, expiry_date || null, created_at);

      res.status(201).json({ success: true, message: 'Receita salva com sucesso.' });
    } catch (err) {
      // Clean up file if db insert fails
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(500).json({ error: err.message });
    }
  });

  // Delete recipe
  router.delete('/:id', (req, res) => {
    try {
      const recipe = db.prepare('SELECT * FROM customer_recipes WHERE id = ?').get(req.params.id);
      
      if (!recipe) {
        return res.status(404).json({ error: 'Receita não encontrada.' });
      }

      // Delete from DB
      db.prepare('DELETE FROM customer_recipes WHERE id = ?').run(req.params.id);

      // Extract filename and delete physical file
      const filename = path.basename(recipe.recipe_image_url);
      const filePath = path.join(recipesDir, filename);
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
