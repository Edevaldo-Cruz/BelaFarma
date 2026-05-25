const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rpaWhatsapp = require('./services/rpa-whatsapp.service');
const messageSender = require('./services/message-sender.service');
const db = require('./database-factory');
const { callAI } = require('./services/ai.service');
const { buscarClimaReal } = require('./services/marketing-agent.service');

// Configuração do diretório de uploads persistente (Windows = public/uploads, Linux/Docker = ../data/uploads)
const uploadDir = process.platform === 'win32'
  ? path.join(__dirname, 'public', 'uploads')
  : path.join(__dirname, '..', 'data', 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuração do Multer para upload de imagens
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
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
  
  // Expõe a pasta de uploads de forma estática e persistente na URL /uploads
  app.use('/uploads', express.static(uploadDir));
  
  // 1. Listar Grupos (Consome a Evolution API + Grupos locais salvos no banco SQLite)
  app.get('/api/whatsapp/groups', async (req, res) => {
    try {
      let apiGroups = [];
      try {
        apiGroups = await messageSender.fetchGroups();
      } catch (fetchErr) {
        console.warn('[WhatsAppGroups] Evolution API indisponível, usando apenas grupos locais:', fetchErr.message);
      }

      // Busca os grupos customizados salvos no banco local
      const customGroups = await db.prepare('SELECT id, name FROM whatsapp_custom_groups').all();
      
      // Converte os grupos customizados no mesmo formato que a API retorna (subject e id)
      const formattedCustomGroups = customGroups.map(cg => ({
        id: cg.id,
        subject: cg.name,
        name: cg.name,
        isCustom: true
      }));

      // Mescla as listas garantindo que não haja IDs duplicados
      const mergedGroups = [...formattedCustomGroups];
      
      // Adiciona da API os que não estiverem na lista de customizados
      for (const group of apiGroups) {
        if (!mergedGroups.some(g => g.id === group.id)) {
          mergedGroups.push(group);
        }
      }

      res.json(mergedGroups);
    } catch (err) {
      console.error('[WhatsAppGroups] Erro ao buscar grupos:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 1b. Salvar novo grupo customizado manualmente no banco local
  app.post('/api/whatsapp/custom-groups', express.json(), async (req, res) => {
    try {
      let { id, name } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'O nome do grupo é obrigatório.' });
      }
      if (!id) {
        id = name;
      }

      await db.prepare(
        'INSERT INTO whatsapp_custom_groups (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name = ?'
      ).run(id, name, name);

      res.status(201).json({ success: true, message: 'Grupo customizado salvo com sucesso!', group: { id, name } });
    } catch (err) {
      console.error('[WhatsAppGroups] Erro ao salvar grupo customizado:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 1c. Deletar grupo customizado local do banco
  app.delete('/api/whatsapp/custom-groups/:id', async (req, res) => {
    try {
      await db.prepare('DELETE FROM whatsapp_custom_groups WHERE id = ?').run(req.params.id);
      res.json({ success: true, message: 'Grupo customizado removido com sucesso!' });
    } catch (err) {
      console.error('[WhatsAppGroups] Erro ao deletar grupo customizado:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Listar Postagens Agendadas
  app.get('/api/whatsapp/scheduled-posts', async (req, res) => {
    try {
      const posts = await db.prepare('SELECT * FROM whatsapp_group_posts ORDER BY scheduledAt ASC').all();
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

      const result = await db.prepare(
        'INSERT INTO whatsapp_group_posts (id, groupId, groupName, content, mediaPath, scheduledAt, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        'post-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
        groupId,
        groupName,
        content,
        mediaPath,
        scheduledAt,
        'Pendente',
        new Date().toISOString()
      );

      res.status(201).json({ id: result.lastInsertRowid, message: 'Agendamento criado com sucesso!' });
    } catch (err) {
      console.error('[WhatsAppGroups] Erro ao agendar:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Excluir Agendamento
  app.delete('/api/whatsapp/scheduled-posts/:id', async (req, res) => {
    try {
      await db.prepare('DELETE FROM whatsapp_group_posts WHERE id = ?').run(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Processar Postagens Pendentes Manualmente (Botão de Teste)
  app.post('/api/whatsapp/process-pending', async (req, res) => {
    try {
      const now = new Date().toISOString();
      const pendingPosts = await db.prepare(
        'SELECT * FROM whatsapp_group_posts WHERE status = ? AND scheduledAt <= ?'
      ).all('Pendente', now);

      console.log(`[WhatsAppGroups] Processando ${pendingPosts.length} postagens pendentes via RPA...`);
      
      const results = [];
      for (const post of pendingPosts) {
        const target = post.groupName || post.groupId;
        const result = await rpaWhatsapp.sendGroupMessage(target, post.content, post.mediaPath);
        
        const status = result.success ? 'Enviado' : 'Erro';
        const errorMsg = result.success ? null : result.error;

        await db.prepare(
          'UPDATE whatsapp_group_posts SET status = ?, errorMessage = ?, sentAt = CURRENT_TIMESTAMP WHERE id = ?'
        ).run(status, errorMsg, post.id);
        
        results.push({ id: post.id, group: target, result });
      }

      res.json({ processed: results.length, results });
    } catch (err) {
      console.error('[WhatsAppGroups] Erro ao processar pendentes:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 6. Enviar Agora (Disparo Imediato via Fila do Windows Agent)
  app.post('/api/whatsapp/send-immediate', upload.single('media'), async (req, res) => {
    const { groupId, groupName, content } = req.body;
    const mediaPath = req.file ? `/uploads/${req.file.filename}` : null;

    console.log(`[WhatsAppGroups] 🚀 Enfileirando envio imediato para o Windows Agent. Grupo: ${groupName || groupId}`);

    try {
      const id = 'post-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
      
      await db.prepare(
        'INSERT INTO whatsapp_group_posts (id, groupId, groupName, content, mediaPath, scheduledAt, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        id,
        groupId || groupName,
        groupName || groupId,
        content,
        mediaPath,
        new Date().toISOString(), // scheduledAt = agora, para envio imediato!
        'Pendente',
        new Date().toISOString()
      );

      res.json({ 
        success: true, 
        message: 'Mensagem colocada na fila de disparo do Windows Agent!', 
        postId: id 
      });
    } catch (error) {
      console.error('[WhatsAppGroups] 💥 Erro ao enfileirar envio imediato:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 6b. Disparar Oferta do Banco de Ofertas Imediatamente (Enfileira com data atual)
  app.post('/api/whatsapp/send-immediate-bank', express.json(), async (req, res) => {
    const { offerId, groupId, groupName } = req.body;

    if (!offerId || !groupId) {
      return res.status(400).json({ error: 'ID da oferta e ID do grupo são obrigatórios.' });
    }

    try {
      // Busca a oferta no banco de ofertas
      const offer = await db.prepare('SELECT * FROM whatsapp_offers_bank WHERE id = ?').get(offerId);
      if (!offer) {
        return res.status(404).json({ error: 'Oferta não encontrada no banco de imagens.' });
      }

      console.log(`[RoboOfertas] 🚀 Enfileirando disparo imediato do banco para a oferta "${offer.productName}"`);

      const id = 'post-immediate-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
      
      // Concatena a legenda com o rodapé obrigatório
      const finalContent = `${offer.aiCaption}\n\nFique atento! A cada hora traremos uma oferta imperdível para você! 🔔`;

      await db.prepare(`
        INSERT INTO whatsapp_group_posts (id, groupId, groupName, content, mediaPath, scheduledAt, status, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        groupId,
        groupName || groupId,
        finalContent,
        offer.mediaPath || null,
        new Date().toISOString(), // scheduledAt = agora para envio imediato!
        'Pendente',
        new Date().toISOString()
      );

      res.json({
        success: true,
        message: 'Oferta colocada na fila de disparo imediato do Robô Windows!',
        postId: id
      });
    } catch (err) {
      console.error('[RoboOfertas] Erro ao enfileirar disparo imediato do banco:', err);
      res.status(500).json({ error: err.message });
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
        const logPath = process.platform === 'win32'
            ? path.join(__dirname, 'backend.log')
            : path.join(__dirname, '..', 'data', 'backend.log');
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
        const logPath = process.platform === 'win32'
            ? path.join(__dirname, 'backend.log')
            : path.join(__dirname, '..', 'data', 'backend.log');
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

  // 12. Iniciar conexão interativa do RPA para obter o QR Code e autenticar
  app.get('/api/whatsapp/rpa-connect', async (req, res) => {
    try {
        console.log('[WhatsAppGroups] 🤖 Iniciando solicitação de conexão RPA em segundo plano...');
        
        // Roda em background para evitar timeout do HTTP na VPS
        rpaWhatsapp.connectSession().then(result => {
            console.log('[WhatsAppGroups] 🤖 Resultado da conexão RPA:', result);
        }).catch(err => {
            console.error('[WhatsAppGroups] 🤖 Erro na conexão RPA:', err);
        });

        res.send(`
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 50px auto; padding: 40px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.15); background: #ffffff; text-align: center; border-top: 5px solid #25d366;">
                <h2 style="color: #25d366; font-size: 28px; margin-bottom: 10px;">🤖 Conexão do Robô WhatsApp Iniciada!</h2>
                <div style="background: #e3f2fd; border-left: 5px solid #2196f3; padding: 20px; text-align: left; margin: 25px 0; border-radius: 4px;">
                    <strong style="color: #0d47a1; font-size: 16px;">Passos Importantes para Escanear:</strong>
                    <ol style="margin-top: 10px; padding-left: 20px; line-height: 1.8; color: #333; font-size: 15px;">
                        <li>Abra o link do QR Code em uma nova aba:
                            <br/>
                            <a href="/api/whatsapp/rpa-screenshot" target="_blank" style="display: inline-block; margin-top: 5px; padding: 8px 15px; background: #25d366; color: white; font-weight: bold; text-decoration: none; border-radius: 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
                                📲 Abrir Tela do QR Code / Screenshot
                            </a>
                        </li>
                        <li>Atualize a página do link acima a cada 3 a 5 segundos até aparecer o QR Code oficial do WhatsApp.</li>
                        <li>Abra o WhatsApp do seu celular, vá em <strong>Aparelhos Conectados > Conectar Aparelho</strong> e escaneie o código.</li>
                        <li>Após escanear, atualize o screenshot novamente: quando carregar suas conversas, o robô estará pareado!</li>
                    </ol>
                </div>
                <p style="font-size: 14px; color: #666; margin-bottom: 0;">
                    ⚠️ A sessão de pareamento ficará aberta por <strong>3 minutos</strong> na VPS. Após esse tempo, o robô fechará automaticamente.
                </p>
            </div>
        `);
    } catch (err) {
        res.status(500).send(err.message);
    }
  });

  // 13. GET /api/whatsapp/agent/pending - Retorna o post pendente mais antigo para o Windows Agent disparar
  app.get('/api/whatsapp/agent/pending', async (req, res) => {
    const { token } = req.query;
    const agentToken = process.env.EVOLUTION_API_KEY || 'BelafarmaSul2026';
    
    if (token !== agentToken) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    try {
      const now = new Date().toISOString();
      const oldestPending = await db.prepare(
        'SELECT * FROM whatsapp_group_posts WHERE status = ? AND scheduledAt <= ? ORDER BY scheduledAt ASC LIMIT 1'
      ).get('Pendente', now);

      if (!oldestPending) {
        return res.json({ hasPending: false });
      }

      // Constrói a URL completa para a mídia (se houver)
      let mediaUrl = null;
      if (oldestPending.mediaPath) {
        const protocol = req.protocol;
        const host = req.get('host');
        mediaUrl = `${protocol}://${host}${oldestPending.mediaPath}`;
      }

      res.json({
        hasPending: true,
        post: {
          id: oldestPending.id,
          groupId: oldestPending.groupId,
          groupName: oldestPending.groupName,
          content: oldestPending.content,
          mediaUrl,
          hasMedia: !!mediaUrl,
          scheduledAt: oldestPending.scheduledAt
        }
      });
    } catch (err) {
      console.error('[WhatsAppGroups] Erro ao buscar pendente para o agente:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 14. POST /api/whatsapp/agent/report - Relata o sucesso ou falha do disparo executado pelo Windows Agent
  app.post('/api/whatsapp/agent/report', express.json(), async (req, res) => {
    const { token } = req.query;
    const agentToken = process.env.EVOLUTION_API_KEY || 'BelafarmaSul2026';
    
    if (token !== agentToken) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const { id, status, errorMessage } = req.body;
    if (!id || !status) {
      return res.status(400).json({ error: 'Parâmetros inválidos. Informe id e status.' });
    }

    try {
      await db.prepare(
        'UPDATE whatsapp_group_posts SET status = ?, errorMessage = ?, sentAt = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(status, errorMessage || null, id);

      console.log(`[WhatsAppGroups] [WindowsAgent] Post ${id} atualizado com status "${status}".`);
      res.json({ success: true });
    } catch (err) {
      console.error('[WhatsAppGroups] Erro ao atualizar status do post via agente:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ========================================================================
  // BANCO DE OFERTAS INTELIGENTE (ROBÔ DE OFERTAS)
  // ========================================================================

  // 1. Listar Ofertas
  app.get('/api/whatsapp/offers-bank', async (req, res) => {
    try {
      const offers = await db.prepare('SELECT * FROM whatsapp_offers_bank ORDER BY createdAt DESC').all();
      res.json(offers);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Cadastrar Oferta Rápida com Extração Multimodal 100% por IA (Visão Computacional)
  app.post('/api/whatsapp/offers-bank', upload.single('media'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'É necessário enviar uma imagem do produto para que a IA possa cadastrá-lo.' });
      }

      const mediaPath = `/uploads/${req.file.filename}`;
      const absoluteImagePath = path.join(__dirname, 'public', mediaPath);

      console.log(`[RoboOfertas] 🖼️ Imagem recebida em: ${absoluteImagePath}. Lendo imagem...`);
      
      let base64Image = '';
      try {
        const imageBuffer = fs.readFileSync(absoluteImagePath);
        base64Image = imageBuffer.toString('base64');
      } catch (readErr) {
        console.error('[RoboOfertas] Erro ao ler imagem física:', readErr.message);
        return res.status(500).json({ error: 'Erro ao processar imagem para análise.' });
      }

      console.log('[RoboOfertas] 🧠 Enviando imagem para a IA analisar o produto, preço, categoria e gerar o texto...');

      const systemPrompt = `Você é a Belinha, a assistente digital de marketing da drogaria Bela Farma Sul em Juiz de Fora, MG.
Seu objetivo é analisar visualmente a imagem de uma oferta de farmácia e extrair todos os detalhes necessários para cadastrar o produto de forma 100% automática.

Você deve responder estritamente com um objeto JSON válido (sem tags markdown de código como \`\`\`json) contendo:
{
  "productName": "Nome exato do produto legível na embalagem ou texto (ex: 'Lavitan Mulher 60 Cápsulas')",
  "price": 19.90, // O preço promocional do produto se estiver visível/escrito na imagem (número decimal, ou 0.00 se não estiver escrito na imagem)
  "category": "vitamina" | "beleza" | "dor" | "higiene" | "infantil" | "geral", // Classifique a categoria correspondente
  "aiCaption": "Texto curto promocional de WhatsApp (até 180 caracteres) criado por você que incentive alegremente a compra do produto. Use emojis apropriados de forma moderada. NÃO inclua o rodapé de ofertas recorrentes."
}

CRITÉRIOS DE CATEGORIZAÇÃO:
- "vitamina": Suplementos alimentares, polivitamínicos, etc.
- "beleza": Cremes estéticos, protetores solares/faciais, maquiagem, dermocosméticos.
- "dor": Medicamentos de venda livre para febre, dor, gripe, tosse, anti-inflamatórios, pastilhas.
- "higiene": Sabonetes, desodorantes, cremes dentais, shampoos em geral.
- "infantil": Fraldas, produtos de cuidado do bebê, pomadas de assadura infantis, leites/fórmulas.
- "geral": Produtos de conveniência ou que não se encaixam acima.

Responda apenas com o JSON.`;

      let extractedData = {
        productName: 'Produto Automático',
        price: 0.00,
        category: 'geral',
        aiCaption: 'Oferta imperdível! Venha aproveitar!'
      };

      try {
        const responseText = await callAI(
          "Analise esta imagem promocional e extraia os dados solicitados.",
          systemPrompt,
          { 
            imageData: base64Image, 
            mimeType: req.file.mimetype,
            temperature: 0.3
          }
        );

        let cleanedJson = responseText.trim();
        if (cleanedJson.startsWith('```')) {
          cleanedJson = cleanedJson.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
        }

        extractedData = { ...extractedData, ...JSON.parse(cleanedJson) };
        console.log('[RoboOfertas] ✅ IA Extraiu com sucesso:', JSON.stringify(extractedData));
      } catch (aiErr) {
        console.error('[RoboOfertas] Erro na análise multimodal de IA:', aiErr.message);
        // Tenta inferir pelo nome do arquivo original se possível
        const originalNameClean = path.basename(req.file.originalname, path.extname(req.file.originalname));
        extractedData.productName = originalNameClean;
      }

      const id = 'offer-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
      await db.prepare(`
        INSERT INTO whatsapp_offers_bank (id, productName, price, category, mediaPath, aiCaption, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        extractedData.productName,
        parseFloat(extractedData.price) || 0.00,
        extractedData.category.toLowerCase(),
        mediaPath,
        extractedData.aiCaption,
        new Date().toISOString()
      );

      res.status(201).json({
        success: true,
        message: 'Oferta cadastrada e analisada por IA com sucesso!',
        offer: { 
          id, 
          productName: extractedData.productName, 
          price: extractedData.price, 
          category: extractedData.category, 
          mediaPath, 
          aiCaption: extractedData.aiCaption 
        }
      });

    } catch (err) {
      console.error('[RoboOfertas] Erro no cadastro/análise da imagem:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Excluir Oferta do Banco
  app.delete('/api/whatsapp/offers-bank/:id', async (req, res) => {
    try {
      const offerId = req.params.id;
      const offer = await db.prepare('SELECT mediaPath FROM whatsapp_offers_bank WHERE id = ?').get(offerId);

      if (!offer) {
        return res.status(404).json({ error: 'Oferta não encontrada.' });
      }

      // Deleta imagem local
      if (offer.mediaPath) {
        const fullPath = path.join(__dirname, 'public', offer.mediaPath);
        if (fs.existsSync(fullPath)) {
          try {
            fs.unlinkSync(fullPath);
            console.log(`[RoboOfertas] Imagem excluída fisicamente: ${fullPath}`);
          } catch (fileErr) {
            console.warn(`[RoboOfertas] Não foi possível excluir a imagem fisica:`, fileErr.message);
          }
        }
      }

      await db.prepare('DELETE FROM whatsapp_offers_bank WHERE id = ?').run(offerId);
      res.json({ success: true, message: 'Oferta excluída do banco com sucesso!' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Gerar Cronograma Inteligente com IA Baseado no Clima e Semana (Slots de :10)
  app.post('/api/whatsapp/offers-bank/generate-schedule', async (req, res) => {
    try {
      console.log('[RoboOfertas] Iniciando orquestração de cronograma inteligente...');
      
      // Busca clima real de Juiz de Fora (open-meteo)
      let climaHumano = 'Temperatura amena (21°C) e tempo parcialmente nublado 🌤️';
      try {
        const climaRaw = await buscarClimaReal();
        if (climaRaw && climaRaw.current_weather) {
          const temp = climaRaw.current_weather.temperature;
          const code = climaRaw.current_weather.weathercode;
          const interpretacao = {
            0: 'Céu limpo ☀️', 1: 'Principalmente limpo 🌤️', 2: 'Parcialmente nublado ⛅', 3: 'Nublado ☁️',
            45: 'Nevoeiro 🌫️', 51: 'Garoa leve 🌦️', 61: 'Chuva leve 🌧️', 80: 'Pancadas de chuva ⛈️', 95: 'Tempestade ⚡'
          };
          climaHumano = `${temp}°C - ${interpretacao[code] || 'Variável'}`;
        }
      } catch (climaErr) {
        console.warn('[RoboOfertas] Falha ao obter clima real, usando fallback:', climaErr.message);
      }

      // Busca ofertas cadastradas
      const offers = await db.prepare('SELECT * FROM whatsapp_offers_bank').all();

      if (offers.length === 0) {
        return res.status(400).json({ error: 'Nenhuma oferta cadastrada no Banco de Imagens. Cadastre ofertas primeiro!' });
      }

      console.log(`[RoboOfertas] ${offers.length} ofertas prontas. Acionando cérebro de marketing...`);

      const dataAtual = new Date();
      const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      const dataFormatada = dataAtual.toLocaleDateString('pt-BR', options);

      const systemPrompt = `Você é o Orquestrador Inteligente de Campanhas da drogaria Bela Farma Sul em Juiz de Fora, MG. 
Sua missão é distribuir e agendar as ofertas do banco ao longo dos slots de postagem de forma estratégica.
A data de hoje para referência de planejamento é: ${dataFormatada} (Ano de 2026).

REGRAS DOS SLOTS DE POSTAGEM:
- Dias permitidos: Segunda a Sexta (das 08:00 até as 20:00) e Sábado (das 08:00 até as 19:00).
- Horários exatos: Sempre na hora cheia e dez minutos (ex: 08:10, 09:10, 10:10, ..., 19:10, 20:10).

CRITÉRIOS DE INTELIGÊNCIA COMERCIAL:
1. Categoria "vitamina": Preferir segundas ou terças pela manhã (estímulo a começar a semana com saúde).
2. Categoria "beleza": Preferir sextas-feiras à tarde ou sábados de manhã (preparação de beleza e autocuidado para o final de semana).
3. Categoria "dor/gripe/sintomas": Se o clima atual em JF estiver frio, chuvoso ou seco (Clima hoje: ${climaHumano}), dê maior visibilidade a esses remédios de alívio rápido e coloque-os em horários estratégicos de pico.
4. Categoria "geral/higiene/infantil": Distribuir uniformemente nos slots intermediários.
5. DATAS COMEMORATIVAS DO COMÉRCIO: Identifique no calendário se há datas comemorativas comerciais importantes próximas da data atual (${dataFormatada}), tais como Dia das Mães (Maio), Dia dos Namorados (Junho), Dia dos Pais (Agosto), Dia do Cliente (Setembro), Dia das Crianças (Outubro), Black Friday (Novembro), Natal (Dezembro), etc. Caso existam datas relevantes próximas ou no próprio mês atual, elabore uma estratégia promocional ligada a esse tema, adaptando as legendas se necessário ou priorizando produtos de autocuidado, presentes ou kits especiais, justificando no campo 'motivoEstrategico' (ex: 'Proximidade com o Dia dos Namorados!').
6. Rodapé obrigatório: No final do texto "content" de cada agendamento, anexe obrigatoriamente a frase:
"\n\nFique atento! A cada hora traremos uma oferta imperdível para você! 🔔"

Você deve responder estritamente com um array JSON válido (sem tags markdown de código como \`\`\`json) contendo a alocação de slots. Cada objeto do array deve ter este formato:
{
  "day": "segunda" | "terca" | "quarta" | "quinta" | "sexta" | "sabado",
  "hour": 8, 9, 10, ..., 20,
  "offerId": "ID da oferta selecionada",
  "productName": "Nome do produto",
  "mediaPath": "Caminho da imagem",
  "content": "Legenda da oferta (aiCaption original) com o rodapé obrigatório adicionado",
  "motivoEstrategico": "Explicar brevemente em português por que este slot foi escolhido baseando-se no clima, dia ou datas comemorativas do comércio próximas (ex: 'Sexta à tarde é o melhor momento para beleza!', 'Aproveitando o clima frio de JF!', 'Campanha especial de aquecimento para o Dia dos Namorados!')"
}

Aloque no mínimo 6 a 12 slots distribuídos estrategicamente pelos dias. Responda apenas com o JSON.`;

      let scheduledList = [];
      try {
        const responseText = await callAI(
          `Distribua as seguintes ofertas estrategicamente: ${JSON.stringify(offers)}`,
          systemPrompt,
          { temperature: 0.7 }
        );

        let cleanedJson = responseText.trim();
        if (cleanedJson.startsWith('```')) {
          cleanedJson = cleanedJson.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
        }

        scheduledList = JSON.parse(cleanedJson);
        console.log(`[RoboOfertas] Cronograma gerado pela IA com ${scheduledList.length} slots planejados.`);
      } catch (aiErr) {
        console.error('[RoboOfertas] Erro ao planejar cronograma com IA:', aiErr.message);
        return res.status(500).json({ error: 'Erro ao gerar o cronograma inteligente pela IA: ' + aiErr.message });
      }

      res.json({
        clima: climaHumano,
        schedule: scheduledList
      });

    } catch (err) {
      console.error('[RoboOfertas] Erro na geração de cronograma:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Confirmar e Salvar os Agendamentos Gerados no Robô
  app.post('/api/whatsapp/offers-bank/confirm-schedule', express.json(), async (req, res) => {
    const { groupId, groupName, items } = req.body;

    if (!groupId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Grupo e lista de posts válidos são obrigatórios.' });
    }

    try {
      console.log(`[RoboOfertas] Confirmando ${items.length} agendamentos no grupo: ${groupName || groupId}...`);
      
      const now = new Date();
      const insertStmt = db.prepare(`
        INSERT INTO whatsapp_group_posts (id, groupId, groupName, content, mediaPath, scheduledAt, status, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // Mapeamento dos dias da semana relativos para datas reais
      const getNextWeekdayDate = (dayName, targetHour) => {
        const dayMap = {
          'segunda': 1, 'terca': 2, 'quarta': 3, 'quinta': 4, 'sexta': 5, 'sabado': 6, 'domingo': 0
        };
        const targetDay = dayMap[dayName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")];
        
        let resultDate = new Date();
        const currentDay = resultDate.getDay();
        
        let daysAhead = (targetDay - currentDay + 7) % 7;
        // Se for o próprio dia de hoje mas o horário já passou, joga para a próxima semana
        if (daysAhead === 0 && resultDate.getHours() >= targetHour) {
          daysAhead = 7;
        } else if (daysAhead === 0 && resultDate.getHours() === targetHour - 1 && resultDate.getMinutes() > 10) {
          // Se falta menos de 1 hora e já passou do minuto 10
          daysAhead = 7;
        }

        resultDate.setDate(resultDate.getDate() + daysAhead);
        resultDate.setHours(targetHour, 10, 0, 0); // Ajusta para hora cheia e 10 minutos
        return resultDate.toISOString();
      };

      let count = 0;
      for (const item of items) {
        const postId = 'post-offers-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
        const scheduledIso = getNextWeekdayDate(item.day, parseInt(item.hour));

        insertStmt.run(
          postId,
          groupId,
          groupName || groupId,
          item.content,
          item.mediaPath || null,
          scheduledIso,
          'Pendente',
          new Date().toISOString()
        );
        count++;
      }

      res.json({
        success: true,
        message: `Sucesso! ${count} ofertas agendadas de hora em hora (:10) no grupo de WhatsApp!`
      });
    } catch (err) {
      console.error('[RoboOfertas] Erro ao confirmar agendamentos:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 15. Abrir pasta do agente localmente no Windows Explorer
  app.get('/api/system/open-agent-folder', (req, res) => {
    try {
      const { exec } = require('child_process');
      const folderPath = path.join(__dirname, 'windows-rpa-agent');
      console.log(`[System] Abrindo pasta do agente local: ${folderPath}`);
      exec(`explorer "${folderPath}"`);
      res.json({ success: true, message: 'Pasta do Robô aberta no Windows Explorer!' });
    } catch (err) {
      console.error('[System] Erro ao abrir pasta do agente:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 16. Baixar Instalador do Robô RPA compactado em ZIP (excluindo node_modules)
  app.get('/api/system/download-agent', (req, res) => {
    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip();
      
      const agentDir = path.join(__dirname, 'windows-rpa-agent');
      console.log(`[System] Gerando ZIP do agente a partir de: ${agentDir}`);

      if (!fs.existsSync(agentDir)) {
        return res.status(404).json({ error: 'Diretório do agente não encontrado no servidor.' });
      }

      // Lê a pasta e adiciona cada item individualmente, ignorando node_modules
      const files = fs.readdirSync(agentDir);
      for (const file of files) {
        if (file === 'node_modules') continue; // Ignora node_modules
        
        const filePath = path.join(agentDir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          zip.addLocalFolder(filePath, file);
        } else {
          zip.addLocalFile(filePath);
        }
      }

      const zipBuffer = zip.toBuffer();
      
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename=windows-rpa-agent.zip');
      res.send(zipBuffer);
      console.log('[System] Download do ZIP do agente enviado com sucesso!');
    } catch (err) {
      console.error('[System] Erro ao gerar ZIP do agente para download:', err);
      res.status(500).json({ error: err.message });
    }
  });

  console.log('[WhatsAppGroups] ✅ Endpoints de grupos inicializados.');
}

module.exports = { initializeWhatsAppGroupEndpoints };
