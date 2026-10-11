import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const security = require('../backend/security.js');
const db = require('../backend/database.js');

describe('Suíte de Segurança Fase 2: LGPD (/uploads), Anti-SSRF, Anti-Path Traversal, CORS e Rate Limit', () => {

  describe('1. Proteção LGPD de Arquivos Confidenciais (/uploads) vs Vitrine Pública', () => {
    it('SEC2-01: Classifica corretamente imagens públicas da Vitrine vs documentos confidenciais (Receitas, Boletos, Notas)', () => {
      // Públicos (Vitrine e Ofertas)
      assert.strictEqual(security.isPublicUploadPath('/produtos/789101112.webp'), true);
      assert.strictEqual(security.isPublicUploadPath('/produtos/dipirona.png'), true);
      assert.strictEqual(security.isPublicUploadPath('/default_product.png'), true);
      assert.strictEqual(security.isPublicUploadPath('/offer_1700000000.jpg'), true);

      // Confidenciais (LGPD / Financeiro)
      assert.strictEqual(security.isPublicUploadPath('/recipes/receita_paciente_123.jpg'), false);
      assert.strictEqual(security.isPublicUploadPath('/notes/nota_fiscal_fornecedor.pdf'), false);
      assert.strictEqual(security.isPublicUploadPath('/finance_temp/fechamento.pdf'), false);
      assert.strictEqual(security.isPublicUploadPath('/boletoFile-1710000000-123.pdf'), false);
      assert.strictEqual(security.isPublicUploadPath('/stockPdf-1710000000-456.pdf'), false);
      assert.strictEqual(security.isPublicUploadPath('/relatorio.csv'), false);
      assert.strictEqual(security.isPublicUploadPath('/backup.db'), false);
      assert.strictEqual(security.isPublicUploadPath('/../belafarma.db'), false);
    });

    it('SEC2-02: Middleware uploadsAuthMiddleware bloqueia anônimos em receitas/boletos e libera fotos da Vitrine com CSP restrito', () => {
      function runUploadsMiddleware(pathStr, headers = {}) {
        let statusCode = 200;
        let jsonBody = null;
        let nextCalled = false;
        const resHeaders = {};

        const req = { path: pathStr, method: 'GET', headers, query: {} };
        const res = {
          setHeader(k, v) { resHeaders[k] = v; },
          status(c) { statusCode = c; return this; },
          json(d) { jsonBody = d; return this; }
        };
        security.uploadsAuthMiddleware(req, res, () => { nextCalled = true; });
        return { statusCode, jsonBody, nextCalled, resHeaders };
      }

      // 1. Foto de produto da Vitrine sem login -> LIBERADO + Header CSP anti-XSS
      const pubRes = runUploadsMiddleware('/produtos/item_vitrine.webp');
      assert.strictEqual(pubRes.nextCalled, true);
      assert.strictEqual(pubRes.statusCode, 200);
      assert.ok(pubRes.resHeaders['Content-Security-Policy'].includes('sandbox'));

      // 2. Receita médica sem login -> BLOQUEADO (401)
      const privAnon = runUploadsMiddleware('/recipes/receita_controlada.jpg');
      assert.strictEqual(privAnon.nextCalled, false);
      assert.strictEqual(privAnon.statusCode, 401);

      // 3. Boleto PDF sem login -> BLOQUEADO (401)
      const boletoAnon = runUploadsMiddleware('/boletoFile-999.pdf');
      assert.strictEqual(boletoAnon.nextCalled, false);
      assert.strictEqual(boletoAnon.statusCode, 401);

      // 4. Receita médica com Cookie belinha_token válido -> LIBERADO
      const validToken = security.signToken({ id: 'usr-1', name: 'Edevaldo', role: 'Administrador' });
      const privAuth = runUploadsMiddleware('/recipes/receita_controlada.jpg', {
        cookie: `belinha_token=${encodeURIComponent(validToken)}`
      });
      assert.strictEqual(privAuth.nextCalled, true);
      assert.strictEqual(privAuth.statusCode, 200);
    });
  });

  describe('2. Proteção Anti-SSRF (Server-Side Request Forgery)', () => {
    it('SEC2-03: Bloqueia URLs internas, localhost, IPs de rede privada, Docker e Cloud Metadata AWS/Oracle', () => {
      const unsafeUrls = [
        'http://localhost:3001/api/all-data',
        'http://127.0.0.1:8080/instance/fetchInstances',
        'http://0.0.0.0:3001/',
        'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
        'http://192.168.1.1/admin',
        'http://10.0.0.12:8080/',
        'http://172.18.0.5:8080/',
        'http://evolution-api:8080/message/sendText',
        'http://backend:3001/api/backups',
        'file:///etc/passwd',
        'ftp://arquivos.servidor.com/imagem.jpg',
        'http://[::1]:3001/'
      ];

      for (const url of unsafeUrls) {
        assert.strictEqual(
          security.isSafeExternalUrl(url),
          false,
          `URL interna/perigosa deveria ser bloqueada pelo Anti-SSRF: ${url}`
        );
      }
    });

    it('SEC2-04: Permite URLs externas públicas legítimas (CDNs de imagens de medicamentos)', () => {
      const safeUrls = [
        'https://cdn-cosmos.bluesoft.com.br/products/7891058001124',
        'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae.jpg',
        'https://www.drogariabelafarma.com.br/logo.png'
      ];

      for (const url of safeUrls) {
        assert.strictEqual(
          security.isSafeExternalUrl(url),
          true,
          `URL pública legítima deveria ser permitida: ${url}`
        );
      }
    });
  });

  describe('3. Prevenção de Path Traversal e Exclusão Arbitrária de Arquivos', () => {
    it('SEC2-05: sanitizeSafeFilename bloqueia tentativas de travessia de diretório e extensões não permitidas', () => {
      const allowedCsvPdf = ['.csv', '.pdf'];

      assert.strictEqual(security.sanitizeSafeFilename('../../belafarma.db', allowedCsvPdf), null);
      assert.strictEqual(security.sanitizeSafeFilename('..\\server.js', allowedCsvPdf), null);
      assert.strictEqual(security.sanitizeSafeFilename('/etc/passwd', allowedCsvPdf), null);
      assert.strictEqual(security.sanitizeSafeFilename('server.js', allowedCsvPdf), null);
      assert.strictEqual(security.sanitizeSafeFilename('malware.exe', allowedCsvPdf), null);
      assert.strictEqual(security.sanitizeSafeFilename('.env', allowedCsvPdf), null);

      assert.strictEqual(security.sanitizeSafeFilename('curva_abc_2026.csv', allowedCsvPdf), 'curva_abc_2026.csv');
      assert.strictEqual(security.sanitizeSafeFilename('relatorio-estoque.pdf', allowedCsvPdf), 'relatorio-estoque.pdf');
    });
  });

  describe('4. Política de Origem CORS Segura e Rate Limiting Global', () => {
    it('SEC2-06: Permite origens oficiais da BelaFarma, LAN e Tauri, mas bloqueia sites externos maliciosos', () => {
      // Origens permitidas
      assert.strictEqual(security.isAllowedCorsOrigin('https://app.drogariabelafarma.com.br'), true);
      assert.strictEqual(security.isAllowedCorsOrigin('https://www.drogariabelafarma.com.br'), true);
      assert.strictEqual(security.isAllowedCorsOrigin('http://localhost:5173'), true);
      assert.strictEqual(security.isAllowedCorsOrigin('http://127.0.0.1:3001'), true);
      assert.strictEqual(security.isAllowedCorsOrigin('http://192.168.15.10:3000'), true);
      assert.strictEqual(security.isAllowedCorsOrigin('tauri://localhost'), true);

      // Origens maliciosas bloqueadas
      assert.strictEqual(security.isAllowedCorsOrigin('https://evil-hacker-site.com'), false);
      assert.strictEqual(security.isAllowedCorsOrigin('https://belafarma-phishing.evil.org'), false);
    });

    it('SEC2-07: Rate Limiter Global de API protege contra flood excessivo de requisições', () => {
      const fakeReq = { headers: { 'x-forwarded-for': '198.51.100.77' } };
      security.clearApiRateLimit(fakeReq);

      for (let i = 0; i < 600; i++) {
        assert.strictEqual(security.checkApiRateLimit(fakeReq).allowed, true);
      }
      // 601ª requisição no mesmo minuto deve ser bloqueada
      assert.strictEqual(security.checkApiRateLimit(fakeReq).allowed, false);

      security.clearApiRateLimit(fakeReq);
      assert.strictEqual(security.checkApiRateLimit(fakeReq).allowed, true);
    });
  });

  describe('5. Teste Integrado HTTP E2E da Fase 2 (SSRF, Path Traversal e RBAC)', () => {
    it('SEC2-08: Endpoints reais bloqueiam SSRF, Path Traversal e Operador em rotas destrutivas', async () => {
      const express = require('../backend/node_modules/express');
      const liquidacaoEndpoints = require('../backend/liquidacao-endpoints.js');
      const filesEndpoints = require('../backend/files-endpoints.js');

      const app = express();
      app.use(express.json());
      app.use('/api', security.apiAuthMiddleware);
      app.use('/api/liquidacao', liquidacaoEndpoints(db));
      app.use('/api/files', filesEndpoints(db));

      const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
      });
      const port = server.address().port;
      const baseUrl = `http://127.0.0.1:${port}`;

      const adminToken = security.signToken({ id: 'usr-adm', name: 'Edevaldo', role: 'Administrador' });
      const operatorToken = security.signToken({ id: 'usr-op', name: 'Caixa', role: 'Operador' });

      try {
        // 1. Tentativa de SSRF via /api/liquidacao/salvar-imagem-url apontando para Evolution API interna
        const ssrfRes = await fetch(`${baseUrl}/api/liquidacao/salvar-imagem-url`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`
          },
          body: JSON.stringify({
            produto_id: 1,
            url: 'http://127.0.0.1:8080/instance/fetchInstances'
          })
        });
        assert.strictEqual(ssrfRes.status, 400);
        const ssrfData = await ssrfRes.json();
        assert.ok(ssrfData.error.includes('bloqueada'));

        // 2. Tentativa de excluir arquivo do servidor via DELETE /api/files/:filename (extensão não permitida / traversal)
        const extRes = await fetch(`${baseUrl}/api/files/server.js`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert.strictEqual(extRes.status, 400);

        const dbFileRes = await fetch(`${baseUrl}/api/files/belafarma.db`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert.strictEqual(dbFileRes.status, 400);

        // 3. Tentativa de Operador acionar reset-digifarma (restrito a Administrador)
        const resetOpRes = await fetch(`${baseUrl}/api/liquidacao/reset-digifarma`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${operatorToken}` }
        });
        assert.strictEqual(resetOpRes.status, 403);
      } finally {
        server.close();
      }
    });
  });
});
