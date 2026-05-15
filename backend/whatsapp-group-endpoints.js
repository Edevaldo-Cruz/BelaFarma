const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rpaWhatsapp = require('./services/rpa-whatsapp.service');
const messageSender = require('./services/message-sender.service');
const db = require('./database-factory');

// Configuração do Multer para upload de imagens
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

/**
 * Inicializa os endpoints relacionados aos grupos do WhatsApp
 * @param {express.Application} app 
 */
function initializeWhatsAppGroupEndpoints(app) {
  
  // 1. Listar Grupos (Consome a Evolution API para preencher o select no frontend)
  app.get('/api/whatsapp/groups', async (req, res) => {
    try {
      const groups = await messageSender.fetchGroups();
      res.json(groups);
    } catch (err) {
      console.error('[WhatsAppGroups] Erro ao buscar grupos:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Listar Postagens Agendadas
  app.get('/api/whatsapp/scheduled-posts', async (req, res) => {
    try {
      const posts = await db.all('SELECT * FROM whatsapp_group_posts ORDER BY scheduledAt ASC');
      res.json(posts);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Criar Novo Agendamento
  app.post('/api/whatsapp/scheduled-posts', upload.single('media'), async (req, res) => {
    try {
      const { groupId, groupName, content, scheduledAt } = req.body;
      const mediaPath = req.file ? `/uploads/${req.file.filename}` : null;

      const result = await db.run(
        'INSERT INTO whatsapp_group_posts (groupId, groupName, content, mediaPath, scheduledAt, status) VALUES (?, ?, ?, ?, ?, ?)',
        [groupId, groupName, content, mediaPath, scheduledAt, 'Pendente']
      );

      res.status(201).json({ id: result.lastID, message: 'Agendamento criado com sucesso!' });
    } catch (err) {
      console.error('[WhatsAppGroups] Erro ao agendar:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Excluir Agendamento
  app.delete('/api/whatsapp/scheduled-posts/:id', async (req, res) => {
    try {
      await db.run('DELETE FROM whatsapp_group_posts WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Processar Postagens Pendentes Manualmente (Botão de Teste)
  app.post('/api/whatsapp/process-pending', async (req, res) => {
    try {
      const now = new Date().toISOString();
      const pendingPosts = await db.all(
        'SELECT * FROM whatsapp_group_posts WHERE status = ? AND scheduledAt <= ?',
        ['Pendente', now]
      );

      console.log(`[WhatsAppGroups] Processando ${pendingPosts.length} postagens pendentes via RPA...`);
      
      const results = [];
      for (const post of pendingPosts) {
        const target = post.groupName || post.groupId;
        const result = await rpaWhatsapp.sendGroupMessage(target, post.content, post.mediaPath);
        
        const status = result.success ? 'Enviado' : 'Erro';
        const errorMsg = result.success ? null : result.error;

        await db.run(
          'UPDATE whatsapp_group_posts SET status = ?, errorMessage = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
          [status, errorMsg, post.id]
        );
        
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
  });

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

  // 9. Ver Screenshot do RPA (QR Code / Erro)
  app.get('/api/whatsapp/rpa-screenshot', (req, res) => {
    try {
        const screenshotPath = path.join(__dirname, 'rpa-screenshot.png');
        if (fs.existsSync(screenshotPath)) {
            res.sendFile(screenshotPath);
        } else {
            res.status(404).send('Nenhum screenshot disponível. Tente realizar um disparo para gerar um.');
        }
    } catch (err) {
        res.status(500).send(err.message);
    }
  });

  // 10. Ver Logs do Sistema (Arquivo)
  app.get('/api/system/logs', (req, res) => {
    try {
        const logPath = path.join(__dirname, 'backend.log');
        if (fs.existsSync(logPath)) {
            const content = fs.readFileSync(logPath, 'utf8');
            const lines = content.split('\n').slice(-200).join('\n');
            res.send(`<pre style="background:#1e1e1e; color:#d4d4d4; padding:20px; font-family:monospace; white-space:pre-wrap;">${lines}</pre>`);
        } else {
            res.send('Arquivo de log ainda não gerado.');
        }
    } catch (err) {
        res.status(500).send(err.message);
    }
  });

  // 10b. Busca no log completo por palavra-chave
  app.get('/api/system/logs/search', (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.status(400).send('Use ?q=termo para buscar.');
        const logPath = path.join(__dirname, 'backend.log');
        if (!fs.existsSync(logPath)) return res.send('Log não encontrado.');
        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.split('\n').filter(l => l.toLowerCase().includes(q.toLowerCase()));
        const result = lines.length > 0 ? lines.join('\n') : `Nenhum resultado para: "${q}"`;
        res.send(`<pre style="background:#1e1e1e; color:#d4d4d4; padding:20px; font-family:monospace; white-space:pre-wrap;">${result}</pre>`);
    } catch (err) {
        res.status(500).send(err.message);
    }
  });

  // 11. Rodar Comando de Diagnóstico/Criação (Evolution API)
  app.get('/api/system/run-diag', async (req, res) => {
    try {
        const { exec } = require('child_process');
        const cmd = `curl -X POST http://evolution-api:8080/instance/create -H 'Content-Type: application/json' -H 'apikey: BelafarmaSul2026' -d '{"instanceName": "belaFarma", "token": "BelafarmaSul2026", "qrcode": true}'`;
        exec(cmd, (error, stdout, stderr) => {
            res.json({ 
                command: 'Criar Instância belaFarma',
                stdout: stdout ? JSON.parse(stdout) : null,
                stderr,
                error: error ? error.message : null
            });
        });
    } catch (err) {
        res.status(500).send(err.message);
    }
  });

  console.log('[WhatsAppGroups] ✅ Endpoints de grupos inicializados.');
}

module.exports = { initializeWhatsAppGroupEndpoints };
