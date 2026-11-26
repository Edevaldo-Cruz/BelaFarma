const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const fetch = require('node-fetch');
const watcherService = require('./services/watcher.service.js');
const incidentTracker = require('./services/incident-tracker.service.js');
const security = require('./security.js');

const ABOUT_CACHE_TTL_MS = 5 * 60 * 1000;
let aboutCache = { data: null, expiresAt: 0 };

function resolveGitHubRepo() {
  const envRepo = String(process.env.GITHUB_REPO || '').trim();
  if (envRepo && envRepo.includes('/')) {
    const [owner, repo] = envRepo.split('/');
    if (owner && repo) {
      return { owner: owner.trim(), repo: repo.replace(/\.git$/i, '').trim() };
    }
  }

  try {
    const remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      timeout: 3000
    }).trim();

    const httpsMatch = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i);
    if (httpsMatch) {
      return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }
  } catch (e) {
    // Fallback para repositório padrão
  }

  return { owner: 'Edevaldo-Cruz', repo: 'BelaFarma' };
}

function readAppVersion() {
  try {
    const pkgPath = path.resolve(__dirname, '../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg && pkg.version) return String(pkg.version);
  } catch (e) {
    // Fallback para versão padrão
  }
  return '1.2.6';
}

function splitCommitMessage(rawMessage) {
  const normalized = String(rawMessage || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return { title: 'Atualização do sistema', description: '' };
  }
  const [firstLine, ...rest] = normalized.split('\n');
  const description = rest.join('\n').trim();
  return {
    title: firstLine.trim() || 'Atualização do sistema',
    description
  };
}

function readLocalGitCommits(owner, repo) {
  try {
    const raw = execFileSync(
      'git',
      ['log', '-n', '20', '--pretty=format:%H%x1f%h%x1f%aI%x1f%an%x1f%s%x1f%b%x1e'],
      {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf8',
        timeout: 4000
      }
    );

    return raw
      .split('\x1e')
      .map(entry => entry.trim())
      .filter(Boolean)
      .slice(0, 20)
      .map(entry => {
        const [sha = '', shortHash = '', date = '', authorName = '', subject = '', body = ''] = entry.split('\x1f');
        const cleanSha = sha.trim();
        const cleanShort = (shortHash || cleanSha.slice(0, 7)).trim();
        const cleanTitle = subject.trim() || 'Atualização do sistema';
        const cleanDesc = body.trim();
        return {
          sha: cleanSha,
          shortHash: cleanShort,
          title: cleanTitle,
          description: cleanDesc,
          fullMessage: cleanDesc ? `${cleanTitle}\n\n${cleanDesc}` : cleanTitle,
          authorName: authorName.trim() || 'Edevaldo-Cruz',
          authorLogin: owner,
          authorAvatar: null,
          date: date.trim() || null,
          htmlUrl: cleanSha ? `https://github.com/${owner}/${repo}/commit/${cleanSha}` : `https://github.com/${owner}/${repo}/commits`
        };
      });
  } catch (e) {
    return [];
  }
}

module.exports = (db) => {

  // GET /api/system/about - Retorna metadados do projeto, contato do desenvolvedor, descrição do GitHub e últimos 20 commits
  router.get('/about', async (req, res) => {
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const nowMs = Date.now();

    if (!forceRefresh && aboutCache.data && nowMs < aboutCache.expiresAt) {
      return res.json({ ...aboutCache.data, cached: true });
    }

    const { owner, repo } = resolveGitHubRepo();
    const appVersion = readAppVersion();

    const headers = {
      'User-Agent': 'BelaFarma-System',
      'Accept': 'application/vnd.github+json'
    };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    let repoData = null;
    let githubCommitsRaw = null;
    let githubUser = null;

    try {
      const [repoResult, commitsResult, userResult] = await Promise.allSettled([
        fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers, timeout: 6000 }),
        fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=20`, { headers, timeout: 6000 }),
        fetch(`https://api.github.com/users/${owner}`, { headers, timeout: 6000 })
      ]);

      if (repoResult.status === 'fulfilled' && repoResult.value.ok) {
        repoData = await repoResult.value.json();
      }
      if (commitsResult.status === 'fulfilled' && commitsResult.value.ok) {
        const parsed = await commitsResult.value.json();
        if (Array.isArray(parsed)) githubCommitsRaw = parsed;
      }
      if (userResult.status === 'fulfilled' && userResult.value.ok) {
        githubUser = await userResult.value.json();
      }
    } catch (err) {
      console.warn('[SYSTEM-ABOUT] Falha ao consultar GitHub API:', err.message);
    }

    let source = 'fallback';
    let commits = [];

    if (Array.isArray(githubCommitsRaw) && githubCommitsRaw.length > 0) {
      source = 'github';
      commits = githubCommitsRaw.slice(0, 20).map(item => {
        const sha = item.sha || '';
        const { title, description } = splitCommitMessage(item.commit?.message || '');
        return {
          sha,
          shortHash: sha.slice(0, 7),
          title,
          description,
          fullMessage: String(item.commit?.message || title).trim(),
          authorName: item.commit?.author?.name || item.author?.login || owner,
          authorLogin: item.author?.login || owner,
          authorAvatar: item.author?.avatar_url || null,
          date: item.commit?.author?.date || item.commit?.committer?.date || null,
          htmlUrl: item.html_url || `https://github.com/${owner}/${repo}/commit/${sha}`
        };
      });
    } else {
      const localCommits = readLocalGitCommits(owner, repo);
      if (localCommits.length > 0) {
        source = 'git-local';
        commits = localCommits;
      }
    }

    const payload = {
      success: true,
      source,
      fetchedAt: new Date().toISOString(),
      appVersion,
      developer: {
        name: githubUser?.name || 'Edevaldo Cruz Antonio',
        displayName: 'Edevaldo Cruz',
        role: 'Desenvolvedor Full-Stack & Criador do BelaFarma',
        avatarUrl: githubUser?.avatar_url || 'https://avatars.githubusercontent.com/u/77896103?v=4',
        bio: githubUser?.bio || 'Responsável pela arquitetura, automações, integrações ERP/PDV, Inteligência Artificial e operação contínua do ecossistema BelaFarma (Belinha).',
        location: githubUser?.location || 'Minas Gerais, Brasil',
        whatsapp: '(32) 98863-4755',
        whatsappUrl: 'https://wa.me/5532988634755?text=Ol%C3%A1%20Edevaldo%2C%20vi%20seu%20contato%20na%20p%C3%A1gina%20Sobre%20do%20BelaFarma!',
        email: 'edevaldo_cruz@hotmail.com',
        githubUsername: owner,
        githubUrl: `https://github.com/${owner}`,
        portfolioUrl: githubUser?.blog || 'https://ecrz-portifolio.netlify.app/',
        publicRepos: typeof githubUser?.public_repos === 'number' ? githubUser.public_repos : null
      },
      repository: {
        name: repoData?.name || repo,
        fullName: repoData?.full_name || `${owner}/${repo}`,
        htmlUrl: repoData?.html_url || `https://github.com/${owner}/${repo}`,
        defaultBranch: repoData?.default_branch || 'main',
        language: repoData?.language || 'TypeScript',
        visibility: repoData?.visibility || (repoData?.private ? 'private' : 'public'),
        stargazersCount: typeof repoData?.stargazers_count === 'number' ? repoData.stargazers_count : 0,
        forksCount: typeof repoData?.forks_count === 'number' ? repoData.forks_count : 0,
        topics: Array.isArray(repoData?.topics) ? repoData.topics : [],
        pushedAt: repoData?.pushed_at || commits[0]?.date || null,
        createdAt: repoData?.created_at || null,
        githubDescription: repoData?.description ? String(repoData.description).trim() : null,
        fallbackDescription: 'Sistema integrado de gestão farmacêutica (Belinha / BelaFarma) com PDV, integração Digifarma, cotações automatizadas BelaPed, controle financeiro, conciliação bancária, crediário, automações WhatsApp e consultoria por Inteligência Artificial.'
      },
      commits
    };

    aboutCache = {
      data: payload,
      expiresAt: Date.now() + ABOUT_CACHE_TTL_MS
    };

    res.json({ ...payload, cached: false });
  });

  // GET /api/system/status - Retorna o relatório completo de saúde do ecossistema
  router.get('/status', async (req, res) => {
    try {
      const health = await watcherService.getSystemHealth();
      res.json(health);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/system/remediate-resources - Executa o plano de auto-correção de recursos
  router.post('/remediate-resources', async (req, res) => {
    try {
      console.log('[WATCHER-REMEDIATE] Disparo manual do plano de auto-correção de recursos...');
      const resultado = await watcherService.executarPlanoAutoCorrecao({ forcar: true });
      res.json(resultado);
    } catch (err) {
      console.error('[WATCHER-REMEDIATE] Erro na auto-correção manual:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // POST /api/system/trigger-service - Executa manualmente um serviço em background
  router.post('/trigger-service', async (req, res) => {
    const { serviceName } = req.body;
    if (!serviceName) {
      return res.status(400).json({ error: 'Parâmetro "serviceName" é obrigatório.' });
    }

    try {
      console.log(`[WATCHER-TRIGGER] Usuário solicitou disparo manual do serviço "${serviceName}"`);

      // Registra que a execução começou (status RUNNING)
      watcherService.registerServiceRun(serviceName, 'RUNNING');

      // Executa de forma assíncrona para não travar a resposta HTTP
      (async () => {
        try {
          switch (serviceName) {
            case 'backup':
              // Faz chamada interna para a rota de backup que já trata o backup completo
              const backupRes = await fetch(`http://localhost:3001/api/backups/create`, {
                method: 'POST',
                headers: { 'x-internal-key': security.getInternalKey() }
              });
              if (!backupRes.ok) {
                const errData = await backupRes.json().catch(() => ({}));
                throw new Error(errData.error || `Erro HTTP ${backupRes.status}`);
              }
              // O próprio server.js fará o registro de sucesso, mas para garantir, registramos aqui também
              watcherService.registerServiceRun('backup', 'SUCCESS');
              break;

            case 'robo_ofertas_jit':
              const { escolherEPostarOfertaInteligente } = require('./whatsapp-group-endpoints.js');
              await escolherEPostarOfertaInteligente();
              watcherService.registerServiceRun('robo_ofertas_jit', 'SUCCESS');
              break;

            case 'robo_status':
              const { postarStatusDiario } = require('./services/whatsapp-status.service.js');
              await postarStatusDiario();
              watcherService.registerServiceRun('robo_status', 'SUCCESS');
              break;

            case 'auto_shortages':
              const autoShortages = require('./services/auto-shortages.service.js');
              const resShortages = await autoShortages.runAutoShortages(0);
              watcherService.registerServiceRun('auto_shortages', 'SUCCESS');
              break;

            case 'radio_news':
              const { gerarCuradoriaNoticas } = require('./services/marketing-agent.service');
              const noticias = await gerarCuradoriaNoticas();
              const radioUrl = process.env.RADIO_API_URL || 'http://192.168.1.70:5005';
              const radioRes = await fetch(`${radioUrl}/api/anunciar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mensagem: noticias, voz: 'pt-BR-FranciscaNeural' })
              });
              if (!radioRes.ok) {
                throw new Error(`Rádio respondeu com status ${radioRes.status}`);
              }
              watcherService.registerServiceRun('radio_news', 'SUCCESS');
              break;

            case 'whatsapp_vendas_sync':
              const whatsappVendasSync = require('./services/whatsapp-vendas-sync.js');
              const syncRes = await whatsappVendasSync.syncScrapedImages();
              if (syncRes && syncRes.success === false) {
                throw new Error(syncRes.error || 'Erro na sincronização de fotos');
              }
              watcherService.registerServiceRun('whatsapp_vendas_sync', 'SUCCESS');
              break;

            default:
              console.error(`[WATCHER-TRIGGER] Serviço desconhecido: ${serviceName}`);
              watcherService.registerServiceRun(serviceName, 'FAILED', `Serviço desconhecido: ${serviceName}`);
          }
        } catch (err) {
          console.error(`[WATCHER-TRIGGER] Erro ao executar "${serviceName}":`, err.message);
          watcherService.registerServiceRun(serviceName, 'FAILED', err.message);
        }
      })();

      res.json({ success: true, message: `Rotina do serviço "${serviceName}" iniciada com sucesso em segundo plano.` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/system/run-watcher-check - Dispara manualmente a rotina de envio de alertas de integridade no WhatsApp
  router.post('/run-watcher-check', async (req, res) => {
    try {
      console.log('[WATCHER-TRIGGER] Disparando verificação manual de alertas do Vigilante...');
      // Executa de forma assíncrona
      watcherService.checkAndAlertDelayedServices().catch(console.error);
      res.json({ success: true, message: 'Rotina de verificação de alertas iniciada. Se houver falhas críticas, o WhatsApp de admin receberá uma mensagem em instantes.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/system/visitors/record - Registra um acesso ao Dashboard e retorna estatísticas
  router.post('/visitors/record', (req, res) => {
    try {
      const userName = req.body?.userName || 'Anônimo';
      const now = new Date();
      const visitedAt = now.toISOString();
      const dateStr = now.toISOString().split('T')[0];

      db.prepare(`
        INSERT INTO page_visitors (visited_at, date_str, user_name)
        VALUES (?, ?, ?)
      `).run(visitedAt, dateStr, userName);

      const todayVisits = db.prepare(`SELECT COUNT(*) as count FROM page_visitors WHERE date_str = ?`).get(dateStr).count;
      const totalVisits = db.prepare(`SELECT COUNT(*) as count FROM page_visitors`).get().count;

      res.json({ success: true, todayVisits, totalVisits });
    } catch (err) {
      console.error('[VISITOR-COUNTER] Erro ao registrar visita:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/system/visitors/stats - Retorna o total de visitas de hoje e acumulado
  router.get('/visitors/stats', (req, res) => {
    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const todayVisits = db.prepare(`SELECT COUNT(*) as count FROM page_visitors WHERE date_str = ?`).get(dateStr).count;
      const totalVisits = db.prepare(`SELECT COUNT(*) as count FROM page_visitors`).get().count;

      res.json({ todayVisits, totalVisits });
    } catch (err) {
      console.error('[VISITOR-COUNTER] Erro ao buscar estatísticas:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/system/incidents - Retorna a lista de incidentes e interrupções registradas
  router.get('/incidents', (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const type = req.query.type || null;
      const incidents = incidentTracker.getIncidents(limit, type);
      res.json(incidents);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/system/incidents/test - Simula um incidente de teste
  router.post('/incidents/test', (req, res) => {
    try {
      const { type = 'SERVICE_FAILURE', severity = 'WARNING', title = 'Incidente de Teste Manual', details = 'Teste gerado pelo usuário para validar o sistema de alertas.' } = req.body || {};
      const id = incidentTracker.recordIncident(type, severity, title, details);
      res.json({ success: true, message: 'Incidente de teste registrado com sucesso!', id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/system/incidents/clear - Limpa o histórico de incidentes
  router.delete('/incidents/clear', security.requireAdmin, (req, res) => {
    try {
      const success = incidentTracker.clearIncidents();
      res.json({ success, message: 'Histórico de incidentes limpo com sucesso.' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/system/logs - Retorna as últimas linhas do log do servidor
  router.get('/logs', (req, res) => {
    try {
      const linesCount = parseInt(req.query.lines) || 150;
      const filter = req.query.filter || null;
      const result = incidentTracker.getRecentLogs(linesCount, filter);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── AUDITORIA DE USO E DESINSTALAÇÃO SEGURA DE FERRAMENTAS (15 DIAS) ───
  const featureAuditService = require('./services/feature-audit.service.js');
  try {
    featureAuditService.initFeatureAuditTables(db);
  } catch (err) {
    console.error('[FEATURE-AUDIT] Erro ao inicializar tabelas de auditoria:', err.message);
  }

  // GET /api/system/feature-audit/status
  router.get('/feature-audit/status', (req, res) => {
    try {
      const report = featureAuditService.getAuditStatus(db);
      res.json({ success: true, ...report });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/system/feature-audit/track
  router.post('/feature-audit/track', (req, res) => {
    try {
      const { featureId, userName } = req.body || {};
      if (!featureId) return res.status(400).json({ error: 'featureId é obrigatório' });
      const updated = featureAuditService.recordFeatureUsage(db, featureId, userName || 'Operador');
      res.json({ success: true, item: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/system/feature-audit/analyze
  router.post('/feature-audit/analyze', security.requireAdmin, (req, res) => {
    try {
      const { featureIds } = req.body || {};
      if (!Array.isArray(featureIds)) {
        return res.status(400).json({ error: 'featureIds deve ser um array' });
      }
      const analysis = featureAuditService.analyzeFeatureDependencies(db, featureIds);
      res.json({ success: true, analysis });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/system/feature-audit/uninstall
  router.post('/feature-audit/uninstall', security.requireAdmin, (req, res) => {
    try {
      const { selectedFeatureIds = [], keptFeatureIds = [], userName = 'Administrador', forceHideOnly = false } = req.body || {};
      const result = featureAuditService.executeSafeUninstall(db, {
        selectedFeatureIds,
        keptFeatureIds,
        userName,
        forceHideOnly
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/system/feature-audit/restore
  router.post('/feature-audit/restore', security.requireAdmin, (req, res) => {
    try {
      const { featureId } = req.body || {};
      if (!featureId) return res.status(400).json({ error: 'featureId é obrigatório' });
      const report = featureAuditService.restoreFeature(db, featureId);
      res.json({ success: true, ...report });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/system/feature-audit/simulate-period
  router.post('/feature-audit/simulate-period', security.requireAdmin, (req, res) => {
    try {
      const { daysAgo = 15 } = req.body || {};
      const report = featureAuditService.simulateFastForward15Days(db, Number(daysAgo));
      res.json({ success: true, ...report });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};

