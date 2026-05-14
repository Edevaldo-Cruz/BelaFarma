const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sender = require('./services/message-sender.service');
const rpaWhatsapp = require('./services/rpa-whatsapp.service');


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

  // 5. DIAGNÓSTICO: Testar envio direto para grupo
  app.post('/api/whatsapp/test-send', async (req, res) => {
    try {
      const { groupId, groupName, message } = req.body;
      const target = groupName || groupId;
      
      if (!target || !message) {
        return res.status(400).json({ error: 'groupId/groupName e message são obrigatórios.' });
      }
      console.log(`[WhatsAppGroups] 🧪 TESTE RPA: Enviando para "${target}": "${message}"`);
      const result = await rpaWhatsapp.sendGroupMessage(target, message);
      console.log(`[WhatsAppGroups] 🧪 Resultado do teste:`, JSON.stringify(result));
      res.json(result);
    } catch (err) {
      console.error('[WhatsAppGroups] Erro no teste de envio:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 6. DIAGNÓSTICO: Forçar processamento dos pendentes
  app.post('/api/whatsapp/process-pending', async (req, res) => {
    try {
      const now = new Date().toISOString();
      const pendingPosts = db.prepare(`
        SELECT * FROM whatsapp_group_posts 
        WHERE status = 'Pendente' AND scheduledAt <= ?
      `).all(now);

      console.log(`[WhatsAppGroups] 🔄 Processando ${pendingPosts.length} post(s) pendente(s) via RPA. Hora atual: ${now}`);
      
      const results = [];
      for (const post of pendingPosts) {
        const target = post.groupName || post.groupId;
        console.log(`[WhatsAppGroups] 📤 Enviando post ${post.id} para "${target}" via RPA...`);
        
        const result = await rpaWhatsapp.sendGroupMessage(target, post.content, post.mediaPath);
        console.log(`[WhatsAppGroups] Resultado:`, JSON.stringify(result));

        if (result.success) {
          db.prepare('UPDATE whatsapp_group_posts SET status = "Enviado", sentAt = ? WHERE id = ?')
            .run(new Date().toISOString(), post.id);
        } else {
          db.prepare('UPDATE whatsapp_group_posts SET status = "Erro", errorMessage = ? WHERE id = ?')
            .run(result.error || 'Erro desconhecido', post.id);
        }
        results.push({ id: post.id, group: target, result });
      }

      res.json({ processed: results.length, results });
    } catch (err) {
      console.error('[WhatsAppGroups] Erro ao processar pendentes:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 6. Enviar Agora (Disparo Imediato via RPA)
  app.post('/api/whatsapp/send-immediate', upload.single('media'), async (req, res) => {
    const { groupId, groupName, content } = req.body;
    let mediaPath = null;

    if (req.file) {
        mediaPath = req.file.path;
    }

    console.log(`[WhatsAppGroups] 🚀 Iniciando envio imediato para: ${groupName || groupId}`);

    try {
        const result = await rpaWhatsapp.sendGroupMessage(groupName || groupId, content, mediaPath);
        
        if (result.success) {
            res.json({ success: true, message: 'Mensagem enviada com sucesso!' });
        } else {
            res.status(500).json({ success: false, error: result.error || 'Falha no envio via RPA' });
        }
    } catch (error) {
        console.error('[WhatsAppGroups] 💥 Erro no envio imediato:', error);
        res.status(500).json({ success: false, error: error.message });
    }
  });

  // 7. Ver Logs do RPA (Debug)
  app.get('/api/whatsapp/rpa-logs', (req, res) => {
    try {
        const logPath = path.join(__dirname, 'rpa-debug.log');
        if (fs.existsSync(logPath)) {
            const content = fs.readFileSync(logPath, 'utf8');
            res.send(`<pre>${content}</pre>`);
        } else {
            res.send('Arquivo de log não encontrado.');
        }
    } catch (err) {
        res.status(500).send(err.message);
    }
  // 8. Debug Evolution API Status
  app.get('/api/whatsapp/debug-evolution', async (req, res) => {
    try {
        const url = `${process.env.EVOLUTION_API_URL || 'http://evolution-api:8080'}/instance/connectionState/${process.env.EVOLUTION_INSTANCE_NAME || 'belaFarma'}`;
        const response = await fetch(url, {
            headers: { 'apikey': process.env.EVOLUTION_API_KEY || 'BelafarmaSul2026' }
        });
        const data = await response.json();
        res.json({
            url,
            status: response.status,
            data,
            env: {
                URL: process.env.EVOLUTION_API_URL,
                INSTANCE: process.env.EVOLUTION_INSTANCE_NAME
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
  });

  console.log('[WhatsAppGroups] ✅ Endpoints de grupos inicializados.');
}

module.exports = { initializeWhatsAppGroupEndpoints };
