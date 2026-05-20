// radio-endpoints.js
// Endpoints para gerenciamento dos anúncios da Rádio Bela Farma

module.exports = (app, db) => {

  // Cria a tabela se não existir (adicionando validade_ate)
  db.exec(`
    CREATE TABLE IF NOT EXISTS radio_anuncios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      mensagem TEXT NOT NULL,
      voz TEXT NOT NULL DEFAULT 'feminina',
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      validade_ate TEXT
    )
  `);

  // Cria tabela de configurações da rádio se não existir
  db.exec(`
    CREATE TABLE IF NOT EXISTS radio_configs (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      descricao TEXT
    )
  `);

  // Preenche configurações iniciais se a tabela estiver vazia
  try {
    const configCount = db.prepare('SELECT COUNT(*) as count FROM radio_configs').get();
    if (configCount.count === 0) {
      const configsIniciais = [
        { chave: "texto_conexao", valor: "Rádio Bela Farma Sul conectada com sucesso ao Spotify. Iniciando transmissão na rede local!", descricao: "Texto falado ao conectar a rádio" },
        { chave: "template_servico", valor: "Agora são {hora}. Hoje é dia {data}. {clima} Drogaria Bela Farma.", descricao: "Template do anúncio de serviço de hora/data/clima" }
      ];
      const insertConfig = db.prepare('INSERT INTO radio_configs (chave, valor, descricao) VALUES (?, ?, ?)');
      const insertManyConfigs = db.transaction((configs) => {
        for (const config of configs) insertConfig.run(config.chave, config.valor, config.descricao);
      });
      insertManyConfigs(configsIniciais);
    }
  } catch (err) {
    console.error('Erro ao inicializar configurações da rádio:', err.message);
  }

  // Se a tabela antiga existir sem a coluna validade_ate, adiciona:
  try {
    db.exec(`ALTER TABLE radio_anuncios ADD COLUMN validade_ate TEXT`);
  } catch (e) {
    // Ignora se a coluna já existir
  }

  // Preenche anúncios iniciais se a tabela estiver vazia
  const count = db.prepare('SELECT COUNT(*) as count FROM radio_anuncios').get();
  if (count.count === 0) {
    const iniciais = [
      { titulo: "Vinheta Principal", mensagem: "Você está ouvindo Rádio Bela Farma! A trilha sonora perfeita para o seu dia. Aqui você encontra saúde, beleza e bem-estar com os melhores preços da região.", voz: "feminina" },
      { titulo: "Ofertas de Vitaminas", mensagem: "Confira nossas ofertas no setor de vitaminas e suplementos. Cuide da sua saúde com quem entende do assunto!", voz: "feminina" },
      { titulo: "Dica: Beba Água", mensagem: "Ei, você aí! Beba pelo menos dois litros de água por dia, tá? Sua pele agradece e seu corpo também! Dica da Bela Farma!", voz: "feminina" },
      { titulo: "Setor de Cosméticos", mensagem: "Novidades no setor de cosméticos! Cremes, maquiagens e produtos das melhores marcas. Passe no nosso setor de beleza!", voz: "feminina" },
      { titulo: "Setor Infantil (Bebê)", mensagem: "Papais e mamães, temos tudo para o seu bebê! Fraldas, lenços e pomadas com preços que cabem no bolso!", voz: "feminina" },
      { titulo: "Dica: Protetor Solar", mensagem: "Gente, não esquece o protetor solar! Todo dia, tá? Na Bela Farma tem as melhores marcas para toda a família!", voz: "feminina" },
      { titulo: "Medicamentos Genéricos", mensagem: "Medicamentos genéricos com até 70 por cento de desconto! Qualidade garantida. Consulte nossos farmacêuticos!", voz: "feminina" },
      { titulo: "Dica: Cuidado com a Pele", mensagem: "Dica rápida pra você: limpa, hidrata e protege! Esses três passos fazem toda a diferença pra uma pele incrível. Bela Farma cuida de você!", voz: "feminina" },
      { titulo: "Perfumaria Importada", mensagem: "Perfumaria importada na Bela Farma! Fragrâncias masculinas e femininas com preços acessíveis. Venha conferir!", voz: "feminina" },
      { titulo: "Agradecimento aos Clientes", mensagem: "Obrigado por escolher a Bela Farma! Saúde e beleza sempre perto de você e sua família.", voz: "masculina" }
    ];
    
    const insert = db.prepare('INSERT INTO radio_anuncios (titulo, mensagem, voz) VALUES (?, ?, ?)');
    const insertMany = db.transaction((ads) => {
      for (const ad of ads) insert.run(ad.titulo, ad.mensagem, ad.voz);
    });
    insertMany(iniciais);
  }

  // GET /api/radio/anuncios - Lista todos os anúncios
  app.get('/api/radio/anuncios', (req, res) => {
    try {
      const anuncios = db.prepare(`
        SELECT * FROM radio_anuncios ORDER BY criado_em DESC
      `).all();
      res.json(anuncios.map(a => ({ ...a, ativo: a.ativo === 1 })));
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  });

  // POST /api/radio/anuncios - Cria novo anúncio
  app.post('/api/radio/anuncios', (req, res) => {
    const { titulo, mensagem, voz = 'feminina', ativo = true, validade_ate = null } = req.body;
    if (!titulo || !mensagem) {
      return res.status(400).json({ erro: 'Título e mensagem são obrigatórios.' });
    }
    try {
      const stmt = db.prepare(`
        INSERT INTO radio_anuncios (titulo, mensagem, voz, ativo, validade_ate)
        VALUES (?, ?, ?, ?, ?)
      `);
      const result = stmt.run(titulo, mensagem, voz, ativo ? 1 : 0, validade_ate);
      res.json({ id: result.lastInsertRowid, titulo, mensagem, voz, ativo, validade_ate });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  });

  // PUT /api/radio/anuncios/:id - Atualiza anúncio
  app.put('/api/radio/anuncios/:id', (req, res) => {
    const { id } = req.params;
    const { titulo, mensagem, voz, ativo, validade_ate } = req.body;
    
    console.log(`[Radio] Tentando atualizar anúncio ${id}:`, { titulo, mensagem, voz, ativo, validade_ate });
    
    try {
      const stmt = db.prepare(`
        UPDATE radio_anuncios 
        SET titulo = ?, mensagem = ?, voz = ?, ativo = ?, validade_ate = ? 
        WHERE id = ?
      `);
      
      const result = stmt.run(
        titulo, 
        mensagem, 
        voz, 
        ativo ? 1 : 0, 
        validade_ate || null, 
        id
      );
      
      if (result.changes === 0) {
        console.warn(`[Radio] Nenhum anúncio encontrado com ID ${id}`);
        return res.status(404).json({ erro: 'Anúncio não encontrado.' });
      }
      
      console.log(`[Radio] Anúncio ${id} atualizado com sucesso.`);
      res.json({ ok: true });
    } catch (err) {
      console.error(`[Radio] Erro ao atualizar anúncio ${id}:`, err.message);
      res.status(500).json({ erro: err.message });
    }
  });

  // DELETE /api/radio/anuncios/:id - Remove anúncio
  app.delete('/api/radio/anuncios/:id', (req, res) => {
    const { id } = req.params;
    try {
      db.prepare('DELETE FROM radio_anuncios WHERE id=?').run(id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  });

  // GET /api/radio/configs - Lista todas as configurações da rádio
  app.get('/api/radio/configs', (req, res) => {
    try {
      const configs = db.prepare('SELECT * FROM radio_configs').all();
      res.json(configs);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  });

  // PUT /api/radio/configs/:chave - Atualiza uma configuração da rádio
  app.put('/api/radio/configs/:chave', (req, res) => {
    const { chave } = req.params;
    const { valor } = req.body;
    
    if (valor === undefined || valor === null) {
      return res.status(400).json({ erro: 'O valor da configuração é obrigatório.' });
    }
    
    try {
      const stmt = db.prepare(`
        UPDATE radio_configs 
        SET valor = ? 
        WHERE chave = ?
      `);
      const result = stmt.run(valor, chave);
      
      if (result.changes === 0) {
        return res.status(404).json({ erro: 'Configuração não encontrada.' });
      }
      res.json({ ok: true, chave, valor });
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  });

  // Proxy: Status do Rádio (evita CORS bloqueando o navegador)
  app.get('/api/radio/status-proxy', async (req, res) => {
    try {
      const response = await fetch('http://192.168.1.70:5005/api/status', { signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error('Rádio não respondeu 200');
      const data = await response.json();
      res.json(data);
    } catch (err) {
      res.status(500).json({ erro: err.message });
    }
  });

  // Proxy: Iniciar Saudação
  app.post('/api/radio/saudacao-proxy', async (req, res) => {
    try {
      console.log('Solicitando saudação ao Pi...');
      const response = await fetch('http://192.168.1.70:5005/api/saudacao', { 
        method: 'POST', 
        signal: AbortSignal.timeout(10000) 
      });
      if (!response.ok) throw new Error(`Pi respondeu com erro: ${response.status}`);
      res.json({ ok: true });
    } catch (err) {
      console.error('Erro no saudacao-proxy:', err.message);
      res.status(500).json({ erro: err.message });
    }
  });

  // Proxy: Disparar Notícias (Antigo - Direto do Pi)
  app.post('/api/radio/noticias-proxy', async (req, res) => {
    try {
      console.log('Solicitando notícias ao Pi...');
      const response = await fetch('http://192.168.1.70:5005/api/noticias', { 
        method: 'POST', 
        signal: AbortSignal.timeout(10000) 
      });
      if (!response.ok) throw new Error(`Pi respondeu com erro: ${response.status}`);
      res.json({ ok: true });
    } catch (err) {
      console.error('Erro no noticias-proxy:', err.message);
      res.status(500).json({ erro: err.message });
    }
  });

  // Disparar Notícias Geradas por IA (ISA-Marketing)
  app.post('/api/radio/disparar-noticias-ia', async (req, res) => {
    try {
      console.log('[Radio] 📰 Iniciando fluxo de notícias IA...');
      const { gerarCuradoriaNoticas } = require('./services/marketing-agent.service');
      
      console.log('[Radio] 🧠 Gerando texto via Isa-Marketing...');
      let noticias = await gerarCuradoriaNoticas();
      
      if (!noticias) {
        throw new Error('A IA não retornou nenhum texto de notícia.');
      }

      // Remover emojis e markdown para evitar falhas no TTS do Pi
      noticias = noticias.replace(/([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g, '');
      noticias = noticias.replace(/[*_#\[\]]/g, '');
      
      console.log('[Radio] 📡 Enviando para o Pi (192.168.1.70:5005)...');
      // Tenta usar o fetch global ou o do node-fetch se disponível
      const fetchApi = typeof fetch !== 'undefined' ? fetch : require('node-fetch');
      
      const response = await fetchApi('http://192.168.1.70:5005/api/anunciar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensagem: noticias,
          voz: 'pt-BR-FranciscaNeural'
        }),
        signal: AbortSignal.timeout(30000) // Aumentado para 30s
      });
      
      if (!response.ok) {
        const errText = await response.text().catch(() => 'Erro desconhecido');
        console.error(`[Radio] ❌ Erro no Pi: ${response.status} - ${errText}`);
        throw new Error(`O dispositivo da rádio (Pi) respondeu com erro: ${response.status}`);
      }
      
      console.log('[Radio] ✅ Notícias enviadas para a fila do Pi com sucesso!');
      
      // Fallback: Forçar o "Play" no Spotify após o tempo estimado da fala
      // Velocidade média da Francisca: ~13 caracteres por segundo
      const tempoEstimadoFalaMs = Math.ceil((noticias.length / 13) * 1000);
      const margemGeracaoTTSMs = 10000; // 10 segundos para gerar o áudio
      const tempoTotalMs = tempoEstimadoFalaMs + margemGeracaoTTSMs;
      
      console.log(`[Radio] ⏱️ O Spotify será retomado em ~${Math.ceil(tempoTotalMs / 1000)} segundos.`);
      
      setTimeout(async () => {
        try {
          console.log('[Radio] 🔄 Forçando o Play no Spotify pós-notícias...');
          await fetchApi('http://192.168.1.70:5005/api/player/play', { method: 'POST' });
          console.log('[Radio] ▶️ Comando de Play enviado com sucesso.');
        } catch (e) {
          console.error('[Radio] Erro no fallback de Play do Spotify:', e.message);
        }
      }, tempoTotalMs);

      res.json({ ok: true, noticias });
    } catch (err) {
      console.error('[Radio] 💥 Erro crítico no disparar-noticias-ia:', err.message);
      res.status(500).json({ erro: err.message });
    }
  });

  // Proxy: Parar Rádio
  app.post('/api/radio/parar-proxy', async (req, res) => {
    try {
      console.log('Solicitando parada ao Pi...');
      const response = await fetch('http://192.168.1.70:5005/api/parar', { 
        method: 'POST', 
        signal: AbortSignal.timeout(10000) 
      });
      if (!response.ok) throw new Error(`Pi respondeu com erro: ${response.status}`);
      res.json({ ok: true });
    } catch (err) {
      console.error('Erro no parar-proxy:', err.message);
      res.status(500).json({ erro: err.message });
    }
  });

  // Proxy: Disparar Anúncio (evita CORS)
  app.post('/api/radio/anunciar-proxy', async (req, res) => {
    try {
      const response = await fetch('http://192.168.1.70:5005/api/anunciar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(10000)
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('Erro no anunciar-proxy:', err.message);
      res.status(500).json({ erro: err.message });
    }
  });

  // Proxy: Mudar Playlist
  app.post('/api/radio/playlist-proxy', async (req, res) => {
    try {
      console.log('Solicitando troca de playlist ao Pi...');
      const response = await fetch('http://192.168.1.70:5005/api/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) {
        const errData = await response.json().catch(()=>({}));
        throw new Error(errData.erro || `Pi respondeu com erro: ${response.status}`);
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('Erro no playlist-proxy:', err.message);
      res.status(500).json({ erro: err.message });
    }
  });

  // Proxy: Controles do Player
  app.post('/api/radio/player-proxy', async (req, res) => {
    try {
      console.log(`Comando de player (${req.body.acao}) enviado ao Pi...`);
      const response = await fetch('http://192.168.1.70:5005/api/player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) {
        const errData = await response.json().catch(()=>({}));
        throw new Error(errData.erro || `Pi respondeu com erro: ${response.status}`);
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('Erro no player-proxy:', err.message);
      res.status(500).json({ erro: err.message });
    }
  });

  // Gerador IA de anúncios
  app.post('/api/radio/gerar-anuncio', async (req, res) => {
    const { ideia } = req.body;
    const { callAI } = require('./services/ai.service');

    if (!ideia) return res.status(400).json({ erro: 'Forneça uma ideia.' });

    const prompt = `Você é um roteirista criativo de rádio indoor para uma farmácia chamada "Bela Farma".
Crie um anúncio falado, cativante e muito natural com no máximo 2 ou 3 frases. 
Deve soar bem quando lido em voz alta. O foco é incentivar as vendas de forma amigável.
Evite emojis e não coloque introduções como "Aqui está o texto". Responda apenas com o texto do anúncio.
Ideia do anúncio: ${ideia}`;

    try {
      const texto = await callAI(prompt, "Você é um roteirista de rádio experiente.", { temperature: 0.8 });
      res.json({ texto: texto.trim() });
    } catch (err) {
      console.error('[Radio AI] Erro na chamada da IA:', err.message);
      res.status(500).json({ erro: 'Falha ao conectar com o serviço de IA.' });
    }
  });

};
