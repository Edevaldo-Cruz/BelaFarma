import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const security = require('../backend/security.js');
const db = require('../backend/database.js');

describe('Suíte de Segurança Fase 1: Belinha & Vitrine', () => {

  describe('1. Assinatura e Verificação JWT (HMAC-SHA256)', () => {
    it('SEC-01: Gera token JWT válido e decodifica payload com integridade', () => {
      const user = { id: 'usr-1', name: 'Edevaldo', role: 'Administrador', jobRole: 'Gerente' };
      const token = security.signToken(user);
      assert.ok(token && token.split('.').length === 3);

      const decoded = security.verifyToken(token);
      assert.ok(decoded);
      assert.strictEqual(decoded.id, 'usr-1');
      assert.strictEqual(decoded.name, 'Edevaldo');
      assert.strictEqual(decoded.role, 'Administrador');
      assert.strictEqual(decoded.jobRole, 'Gerente');
    });

    it('SEC-02: Rejeita tokens adulterados (tentativa de escalar privilégio no payload)', () => {
      const operator = { id: 'usr-2', name: 'Operador Teste', role: 'Operador' };
      const token = security.signToken(operator);
      const parts = token.split('.');

      // Tenta adulterar o payload mudando role para Administrador
      const forgedPayload = Buffer.from(
        JSON.stringify({ id: 'usr-2', name: 'Operador Teste', role: 'Administrador', exp: 9999999999 })
      ).toString('base64url');
      const forgedToken = `${parts[0]}.${forgedPayload}.${parts[2]}`;

      assert.strictEqual(security.verifyToken(forgedToken), null);
    });

    it('SEC-03: Rejeita tokens expirados', () => {
      const user = { id: 'usr-1', name: 'Edevaldo', role: 'Administrador' };
      const expiredToken = security.signToken(user, -10);
      assert.strictEqual(security.verifyToken(expiredToken), null);
    });
  });

  describe('2. Hashing de Senhas (scrypt) e Sanitização de Usuário', () => {
    it('SEC-04: Gera hash scrypt com salt único e valida chave corretamente', () => {
      const hash = security.hashAccessKey('MinhaChaveSecreta2026');
      assert.ok(hash.startsWith('scrypt$'));

      assert.strictEqual(security.verifyAccessKey('MinhaChaveSecreta2026', null, hash), true);
      assert.strictEqual(security.verifyAccessKey('minhachavesecreta2026', null, hash), true);
      assert.strictEqual(security.verifyAccessKey('ChaveErrada', null, hash), false);
    });

    it('SEC-05: Mantém compatibilidade com chaves legadas e remove accessKey no sanitizeUser', () => {
      assert.strictEqual(security.verifyAccessKey('2494', '2494', null), true);
      assert.strictEqual(security.verifyAccessKey('9999', '2494', null), false);

      const rawUser = {
        id: 'usr-edevaldo',
        name: 'Edevaldo',
        role: 'Administrador',
        accessKey: '2494',
        accessKeyHash: 'scrypt$abc$def'
      };
      const clean = security.sanitizeUser(rawUser);
      assert.strictEqual(clean.accessKey, undefined);
      assert.strictEqual(clean.accessKeyHash, undefined);
      assert.strictEqual(clean.name, 'Edevaldo');
    });

    it('SEC-06: Banco de dados possui coluna accessKeyHash na tabela users', () => {
      const cols = db.prepare("PRAGMA table_info('users')").all();
      const hasHashCol = cols.some((c) => c.name === 'accessKeyHash');
      assert.strictEqual(hasHashCol, true, 'Tabela users deve conter a coluna accessKeyHash');
    });
  });

  describe('3. Proteção de Rotas (/api/*) vs Rotas Públicas da Vitrine', () => {
    function runMiddleware(middleware, reqOverrides = {}) {
      let statusCode = 200;
      let jsonBody = null;
      let nextCalled = false;

      const req = {
        path: '/',
        method: 'GET',
        headers: {},
        query: {},
        ...reqOverrides
      };
      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        json(data) {
          jsonBody = data;
          return this;
        }
      };
      const next = () => {
        nextCalled = true;
      };

      middleware(req, res, next);
      return { statusCode, jsonBody, nextCalled, req };
    }

    it('SEC-07: Bloqueia acesso anônimo a rotas confidenciais (/api/all-data, /api/cash-closings, /api/backups)', () => {
      for (const protectedPath of ['/all-data', '/cash-closings', '/boletos', '/customers', '/backups', '/users']) {
        const result = runMiddleware(security.apiAuthMiddleware, { path: protectedPath, method: 'GET' });
        assert.strictEqual(result.nextCalled, false, `Rota ${protectedPath} não deve permitir acesso anônimo`);
        assert.strictEqual(result.statusCode, 401);
        assert.strictEqual(result.jsonBody.code, 'UNAUTHORIZED');
      }
    });

    it('SEC-08: Permite acesso público irrestrito às rotas da Vitrine e Login', () => {
      const publicRoutes = [
        { path: '/liquidacao/public/ofertas', method: 'GET' },
        { path: '/liquidacao/public/analytics/track', method: 'POST' },
        { path: '/login', method: 'POST' },
        { path: '/version', method: 'GET' },
        { path: '/webhook/evolution', method: 'POST' },
        { path: '/whatsapp/agent/pending', method: 'GET' }
      ];

      for (const route of publicRoutes) {
        const result = runMiddleware(security.apiAuthMiddleware, route);
        assert.strictEqual(result.nextCalled, true, `Rota pública ${route.path} deve ser liberada`);
        assert.strictEqual(result.statusCode, 200);
      }
    });

    it('SEC-09: Permite acesso a rotas protegidas com Token Bearer ou Cookie HttpOnly válido', () => {
      const token = security.signToken({ id: 'usr-1', name: 'Edevaldo', role: 'Administrador' });

      // Via Header Authorization
      const resBearer = runMiddleware(security.apiAuthMiddleware, {
        path: '/all-data',
        headers: { authorization: `Bearer ${token}` }
      });
      assert.strictEqual(resBearer.nextCalled, true);
      assert.strictEqual(resBearer.req.user.name, 'Edevaldo');

      // Via Cookie HttpOnly
      const resCookie = runMiddleware(security.apiAuthMiddleware, {
        path: '/cash-closings',
        headers: { cookie: `belinha_token=${encodeURIComponent(token)}` }
      });
      assert.strictEqual(resCookie.nextCalled, true);
      assert.strictEqual(resCookie.req.user.role, 'Administrador');
    });

    it('SEC-10: Controle de Acesso Baseado em Função (RBAC): bloqueia Operador em rotas de Admin', () => {
      const opResult = runMiddleware(security.requireAdmin, {
        user: { id: 'usr-op', name: 'Caixa', role: 'Operador', jobRole: 'Operador(a) de Caixa' }
      });
      assert.strictEqual(opResult.nextCalled, false);
      assert.strictEqual(opResult.statusCode, 403);

      const admResult = runMiddleware(security.requireAdmin, {
        user: { id: 'usr-adm', name: 'Edevaldo', role: 'Administrador', jobRole: 'Gerente' }
      });
      assert.strictEqual(admResult.nextCalled, true);
    });
  });

  describe('4. Rate Limiting (Anti-Brute-Force) e Sanitização de Arquivos', () => {
    it('SEC-11: Rate Limiter bloqueia IP após 10 falhas consecutivas de login e limpa após sucesso', () => {
      const mockReq = { headers: { 'x-forwarded-for': '203.0.113.99' } };
      security.clearLoginFailures(mockReq);

      for (let i = 0; i < 10; i++) {
        assert.strictEqual(security.checkLoginRateLimit(mockReq).allowed, true);
        security.recordLoginFailure(mockReq);
      }

      const blocked = security.checkLoginRateLimit(mockReq);
      assert.strictEqual(blocked.allowed, false);
      assert.ok(blocked.retryAfterSec > 0);

      security.clearLoginFailures(mockReq);
      assert.strictEqual(security.checkLoginRateLimit(mockReq).allowed, true);
    });

    it('SEC-12: Sanitização bloqueia Path Traversal em backups e extensões executáveis em uploads', () => {
      assert.strictEqual(security.sanitizeBackupFilename('../../etc/passwd'), null);
      assert.strictEqual(security.sanitizeBackupFilename('..\\belafarma.db'), null);
      assert.strictEqual(security.sanitizeBackupFilename('script.sh'), null);
      assert.strictEqual(security.sanitizeBackupFilename('belinha_2026-10-11.db'), 'belinha_2026-10-11.db');

      assert.strictEqual(security.isSafeUploadFile('shell.php'), false);
      assert.strictEqual(security.isSafeUploadFile('malware.exe'), false);
      assert.strictEqual(security.isSafeUploadFile('exploit.js'), false);
      assert.strictEqual(security.isSafeUploadFile('produto.webp'), true);
      assert.strictEqual(security.isSafeUploadFile('boleto.pdf'), true);
      assert.strictEqual(security.isSafeUploadFile('nota_fiscal.xml'), true);
    });
  });

  describe('5. Integração E2E HTTP: Fluxo Completo Belinha & Vitrine', () => {
    it('SEC-13: Fluxo HTTP real valida Vitrine pública, bloqueio anônimo, Login JWT/Cookie e ocultação de senhas', async () => {
      const express = require('../backend/node_modules/express');
      const liquidacaoEndpoints = require('../backend/liquidacao-endpoints.js');

      const app = express();
      app.disable('x-powered-by');
      app.use(security.securityHeadersMiddleware);
      app.use(express.json());
      app.use('/api', security.apiAuthMiddleware);

      // Rota de Login real
      app.post('/api/login', (req, res) => {
        const { accessKey } = req.body || {};
        const allUsers = db.prepare('SELECT * FROM users').all();
        const matched = allUsers.find((u) => security.verifyAccessKey(accessKey, u.accessKey, u.accessKeyHash));
        if (!matched) {
          return res.status(401).json({ error: 'Não autorizado' });
        }
        const safeUser = security.sanitizeUser(matched);
        const token = security.signToken(safeUser);
        security.setAuthCookie(req, res, token);
        return res.status(200).json({ ...safeUser, token });
      });

      // Rota protegida /api/all-data
      app.get('/api/all-data', (req, res) => {
        const users = db.prepare('SELECT id, name, role, jobRole, phone FROM users').all();
        res.json({ users: { documents: users } });
      });

      // Rota administrativa /api/backups
      app.get('/api/backups', security.requireAdmin, (req, res) => {
        res.json({ ok: true });
      });

      // Rotas da Vitrine
      app.use('/api/liquidacao', liquidacaoEndpoints(db));

      const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
      });
      const port = server.address().port;
      const baseUrl = `http://127.0.0.1:${port}`;

      try {
        // 1. Vitrine pública funciona sem login e inclui headers de segurança
        const vitrineRes = await fetch(`${baseUrl}/api/liquidacao/public/ofertas`);
        assert.strictEqual(vitrineRes.status, 200);
        assert.strictEqual(vitrineRes.headers.get('x-content-type-options'), 'nosniff');
        assert.strictEqual(vitrineRes.headers.get('x-frame-options'), 'SAMEORIGIN');
        assert.strictEqual(vitrineRes.headers.get('x-powered-by'), null);
        const vitrineData = await vitrineRes.json();
        assert.strictEqual(vitrineData.sucesso, true);
        assert.ok(vitrineData.produtos.length > 0);

        // 2. /api/all-data sem token é bloqueado com 401
        const anonRes = await fetch(`${baseUrl}/api/all-data`);
        assert.strictEqual(anonRes.status, 401);

        // 3. Login no Belinha emite token + Cookie HttpOnly e não expõe accessKey
        const sampleUser = db.prepare('SELECT * FROM users LIMIT 1').get();
        assert.ok(sampleUser, 'Deve existir pelo menos 1 usuário no banco para teste');

        const loginRes = await fetch(`${baseUrl}/api/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessKey: sampleUser.accessKey })
        });
        assert.strictEqual(loginRes.status, 200);
        const setCookie = loginRes.headers.get('set-cookie') || '';
        assert.ok(setCookie.includes('belinha_token='));
        assert.ok(setCookie.includes('HttpOnly'));

        const loginData = await loginRes.json();
        assert.ok(loginData.token);
        assert.strictEqual(loginData.accessKey, undefined);
        assert.strictEqual(loginData.accessKeyHash, undefined);

        // 4. /api/all-data com token retorna usuários sem accessKey
        const authRes = await fetch(`${baseUrl}/api/all-data`, {
          headers: { Authorization: `Bearer ${loginData.token}` }
        });
        assert.strictEqual(authRes.status, 200);
        const allData = await authRes.json();
        assert.ok(Array.isArray(allData.users.documents));
        for (const u of allData.users.documents) {
          assert.strictEqual(u.accessKey, undefined, 'Nenhum usuário em /api/all-data pode expor accessKey');
          assert.strictEqual(u.accessKeyHash, undefined);
        }
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });
  });
});
