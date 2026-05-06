const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sender = require('./services/message-sender.service');

// Diretório para as imagens do WhatsApp
const whatsappUploadsDir = path.join(__dirname, 'public/uploads/whatsapp');
if (!fs.existsSync(whatsappUploadsDir)) {
  fs.mkdirSync(whatsappUploadsDir, { recursive: true });
}

// Configuração do Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, whatsappUploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'wa-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

function initializeWhatsAppGroupEndpoints(app, db) {
  
  // 1. Listar Grupos (Proxy para Evolution API)
  app.get('/api/whatsapp/groups', async (req, res) => {
    try {
      const groups = await sender.fetchGroups();
      res.json(groups);
    } catch (err) {
      console.error('[WhatsAppGroups] Erro ao buscar grupos:', err);
      res.status(500).json({ error: 'Falha ao buscar grupos do WhatsApp.' });
    }
  });

  // 2. Listar Agendamentos
  app.get('/api/whatsapp/scheduled-posts', (req, res) => {
    try {
      const posts = db.prepare('SELECT * FROM whatsapp_group_posts ORDER BY scheduledAt ASC').all();
      res.json(posts);
    } catch (err) {
      console.error('[WhatsAppGroups] Erro ao buscar agendamentos:', err);
      res.status(500).json({ error: 'Falha ao buscar agendamentos.' });
    }
  });

  // 3. Criar Agendamento (com Imagem Opcional)
  app.post('/api/whatsapp/scheduled-posts', upload.single('media'), (req, res) => {
    try {
      const { groupId, groupName, content, scheduledAt } = req.body;
      const mediaPath = req.file ? req.file.path : null;

      if (!groupId || !content || !scheduledAt) {
        return res.status(400).json({ error: 'groupId, content e scheduledAt são obrigatórios.' });
      }

      const id = `post-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const createdAt = new Date().toISOString();

      db.prepare(`
        INSERT INTO whatsapp_group_posts (id, groupId, groupName, content, mediaPath, scheduledAt, status, createdAt)
        VALUES (@id, @groupId, @groupName, @content, @mediaPath, @scheduledAt, 'Pendente', @createdAt)
      `).run({
        id, groupId, groupName, content, mediaPath, scheduledAt, createdAt
      });

      res.status(201).json({ id, status: 'Pendente' });
    } catch (err) {
      console.error('[WhatsAppGroups] Erro ao criar agendamento:', err);
      res.status(500).json({ error: 'Falha ao criar agendamento.' });
    }
  });

  // 4. Deletar/Cancelar Agendamento
  app.delete('/api/whatsapp/scheduled-posts/:id', (req, res) => {
    try {
      const { id } = req.params;
      
      // Busca o post para remover a imagem se existir
      const post = db.prepare('SELECT mediaPath FROM whatsapp_group_posts WHERE id = ?').get(id);
      
      if (post && post.mediaPath && fs.existsSync(post.mediaPath)) {
        fs.unlinkSync(post.mediaPath);
      }

      const result = db.prepare('DELETE FROM whatsapp_group_posts WHERE id = ?').run(id);
      
      if (result.changes > 0) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Agendamento não encontrado.' });
      }
    } catch (err) {
      console.error('[WhatsAppGroups] Erro ao deletar agendamento:', err);
      res.status(500).json({ error: 'Falha ao deletar agendamento.' });
    }
  });

  console.log('[WhatsAppGroups] ✅ Endpoints de grupos inicializados.');
}

module.exports = { initializeWhatsAppGroupEndpoints };
