import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const security = require('../backend/security.js');
const db = require('../backend/database.js');

describe('Suíte de Segurança Fase 3: Trilha de Auditoria, Criptografia AES-256-GCM, Webhook Auth e Hardening Nginx', () => {

  describe('1. Criptografia Simétrica AES-256-GCM e Mascaramento de Segredos (LGPD / Credenciais)', () => {
    it('SEC3-01: Criptografa e descriptografa segredos com AES-256-GCM usando IV aleatório por operação', () => {
      const secret = 'AIzaSyD-ChaveSecretaGemini2026BelaFarma';
      const enc1 = security.encryptSecret(secret);
      const enc2 = security.encryptSecret(secret);

      assert.ok(enc1.startsWith('enc:v1:'));
      assert.ok(enc2.startsWith('enc:v1:'));
      // IV aleatório garante que duas criptografias do mesmo valor geram ciphertexts distintos
      assert.notStrictEqual(enc1, enc2);

      // Ambas descriptografam para o valor exato original
      assert.strictEqual(security.decryptSecret(enc1), secret);
      assert.strictEqual(security.decryptSecret(enc2), secret);

      // Idempotência: chamar encryptSecret em valor já criptografado não duplica criptografia
      assert.strictEqual(security.encryptSecret(enc1), enc1);
    });

    it('SEC3-02: Mantém retrocompatibilidade com valores legados em texto puro e mascara segredos na visualização', () => {
      assert.strictEqual(security.decryptSecret('valor_legado_texto_puro'), 'valor_legado_texto_puro');

      const enc = security.encryptSecret('BelafarmaSul2026SecretKey');
      const masked = security.maskSecret(enc);
      assert.ok(masked.startsWith('Bel'));
      assert.ok(masked.endsWith('Key'));
      assert.ok(masked.includes('******'));
      assert.ok(!masked.includes('farmaSul2026'));
    });

    it('SEC3-03: Identifica corretamente chaves sensíveis de configuração vs chaves operacionais comuns', () => {
      assert.strictEqual(security.isSensitiveSettingKey('gemini_api_key'), true);
      assert.strictEqual(security.isSensitiveSettingKey('evolution_apikey'), true);
      assert.strictEqual(security.isSensitiveSettingKey('napp_password'), true);
      assert.strictEqual(security.isSensitiveSettingKey('openai_secret_key'), true);
      assert.strictEqual(security.isSensitiveSettingKey('whatsapp_auth_token'), true);

      assert.strictEqual(security.isSensitiveSettingKey('temperature_config'), false);
      assert.strictEqual(security.isSensitiveSettingKey('auto_offer_group_id'), false);
      assert.strictEqual(security.isSensitiveSettingKey('store_opening_hours'), false);
    });
  });

  describe('2. Trilha de Auditoria Imutável (security_audit_logs)', () => {
    it('SEC3-04: Tabela security_audit_logs existe no banco SQLite e registra eventos sanitizando senhas/tokens', () => {
      const cols = db.prepare("PRAGMA table_info('security_audit_logs')").all();
      assert.ok(cols.length >= 10, 'Tabela security_audit_logs deve existir com todas as colunas');

      const sanitized = security.sanitizeAuditPayload({
        name: 'Operador Teste',
        accessKey: '123456',
        password: 'secret',
        token: 'jwt-token',
        imagem_base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
      });

      assert.strictEqual(sanitized.name, 'Operador Teste');
      assert.strictEqual(sanitized.accessKey, '[REDACTED]');
      assert.strictEqual(sanitized.password, '[REDACTED]');
      assert.strictEqual(sanitized.token, '[REDACTED]');
      assert.strictEqual(sanitized.imagem_base64, '[REDACTED]');

      const auditId = security.recordAuditLog(db, {
        userId: 'usr-test-audit',
        userName: 'Edevaldo',
        userRole: 'Administrador',
        ip: '127.0.0.1',
        method: 'DELETE',
        path: '/boletos/bol-999',
        actionCategory: 'FINANCIAL_PAYABLES',
        targetId: 'bol-999',
        details: { reason: 'Teste automatizado Fase 3' },
        statusCode: 200
      });

      assert.ok(auditId && auditId.startsWith('aud_'));
      const saved = db.prepare('SELECT * FROM security_audit_logs WHERE id = ?').get(auditId);
      assert.ok(saved);
      assert.strictEqual(saved.user_name, 'Edevaldo');
      assert.strictEqual(saved.action_category, 'FINANCIAL_PAYABLES');
      assert.strictEqual(saved.target_id, 'bol-999');

      // Limpa registro de teste
      db.prepare('DELETE FROM security_audit_logs WHERE id = ?').run(auditId);
    });

    it('SEC3-05: Classifica corretamente ações críticas financeiras, de usuários e backups para auditoria', () => {
      assert.strictEqual(security.classifyAuditCategory('DELETE', '/cash-closings/123'), 'FINANCIAL_CASH');
      assert.strictEqual(security.classifyAuditCategory('DELETE', '/boletos/456'), 'FINANCIAL_PAYABLES');
      assert.strictEqual(security.classifyAuditCategory('POST', '/users'), 'USERS_RBAC');
      assert.strictEqual(security.classifyAuditCategory('GET', '/backups/download/belinha.db'), 'BACKUP_OR_AGENT_DOWNLOAD');
      assert.strictEqual(security.classifyAuditCategory('PUT', '/settings/gemini_api_key'), 'SYSTEM_SETTINGS');
      assert.strictEqual(security.classifyAuditCategory('POST', '/liquidacao/reset-digifarma'), 'PRICING_DIGIFARMA');

      // Consultas GET normais e analytics públicos não geram ruído na auditoria de segurança
      assert.strictEqual(security.classifyAuditCategory('GET', '/liquidacao/public/ofertas'), null);
      assert.strictEqual(security.classifyAuditCategory('POST', '/liquidacao/public/analytics/track'), null);
    });
  });

  describe('3. Autenticação de Webhook (/api/webhook/evolution) e Rate Limit de Escrita Pública', () => {
    it('SEC3-06: Bloqueia chamadas falsas ao Webhook vindas da internet pública sem chave e libera Docker/LAN ou com apikey', () => {
      const expectedKey = process.env.EVOLUTION_API_KEY || 'BelafarmaSul2026';

      // 1. Chamada externa maliciosa sem chave -> BLOQUEADA
      const spoofedExternalReq = {
        path: '/webhook/evolution',
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.88' },
        query: {}
      };
      assert.strictEqual(security.verifyWebhookOrLocalRequest(spoofedExternalReq), false);

      // 2. Chamada externa com apikey oficial da Evolution -> LIBERADA
      const authExternalReq = {
        path: '/webhook/evolution',
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.88', apikey: expectedKey },
        query: {}
      };
      assert.strictEqual(security.verifyWebhookOrLocalRequest(authExternalReq), true);

      // 3. Chamada interna da rede Docker (172.18.0.4) -> LIBERADA
      const dockerInternalReq = {
        path: '/webhook/evolution',
        method: 'POST',
        headers: { 'x-forwarded-for': '172.18.0.4' },
        query: {}
      };
      assert.strictEqual(security.verifyWebhookOrLocalRequest(dockerInternalReq), true);
    });

    it('SEC3-07: Rate Limit de escrita pública bloqueia spam excessivo em rotas de tracking da Vitrine', () => {
      const spamReq = { headers: { 'x-forwarded-for': '198.51.100.200' } };
      security.clearPublicWriteRateLimit(spamReq);

      for (let i = 0; i < 120; i++) {
        assert.strictEqual(security.checkPublicWriteRateLimit(spamReq).allowed, true);
      }
      assert.strictEqual(security.checkPublicWriteRateLimit(spamReq).allowed, false);

      security.clearPublicWriteRateLimit(spamReq);
      assert.strictEqual(security.checkPublicWriteRateLimit(spamReq).allowed, true);
    });
  });

  describe('4. Hardening de Infraestrutura Nginx e Teste E2E HTTP da Fase 3', () => {
    it('SEC3-08: Arquivos de configuração Nginx ocultam versão (server_tokens off) e bloqueiam arquivos ocultos/bancos', () => {
      const rootDir = path.resolve(import.meta.dirname, '..');
      const nginxConf = fs.readFileSync(path.join(rootDir, 'nginx', 'nginx.conf'), 'utf8');
      const proxyAppConf = fs.readFileSync(path.join(rootDir, 'proxy_app.conf'), 'utf8');
      const proxyWwwConf = fs.readFileSync(path.join(rootDir, 'proxy_www.conf'), 'utf8');

      assert.ok(nginxConf.includes('server_tokens off;'));
      assert.ok(nginxConf.includes('deny all;'));
      assert.ok(proxyAppConf.includes('server_tokens off;'));
      assert.ok(proxyAppConf.includes('Strict-Transport-Security'));
      assert.ok(proxyWwwConf.includes('server_tokens off;'));
      assert.ok(proxyWwwConf.includes('Strict-Transport-Security'));
    });

    it('SEC3-09: Fluxo E2E HTTP grava configurações sensíveis criptografadas no SQLite e gera log de auditoria automático', async () => {
      const express = require('../backend/node_modules/express');
      const app = express();
      app.use(express.json());
      app.use('/api', security.apiAuthMiddleware);
      app.use('/api', security.createAuditMiddleware(db));

      // Simula os endpoints de /api/settings e /api/security/audit-logs do server.js
      app.put('/api/settings/:key', (req, res) => {
        const { key } = req.params;
        const { value } = req.body;
        if (security.isSensitiveSettingKey(key) && !security.isAdminUser(req.user)) {
          return res.status(403).json({ error: 'Restrito a administradores' });
        }
        const storedValue = security.isSensitiveSettingKey(key)
          ? security.encryptSecret(String(value))
          : String(value);
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO system_settings (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `).run(key, storedValue, now);
        res.json({ key, value: security.isSensitiveSettingKey(key) ? security.maskSecret(storedValue) : storedValue });
      });

      app.get('/api/security/audit-logs', security.requireAdmin, (req, res) => {
        const logs = db.prepare('SELECT * FROM security_audit_logs WHERE target_id = ? ORDER BY timestamp DESC LIMIT 5').all('test_secret_api_key');
        res.json({ logs });
      });

      const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
      });
      const port = server.address().port;
      const baseUrl = `http://127.0.0.1:${port}`;

      const adminToken = security.signToken({ id: 'usr-adm', name: 'Edevaldo', role: 'Administrador' });
      const operatorToken = security.signToken({ id: 'usr-op', name: 'Operador Caixa', role: 'Operador' });

      try {
        // 1. Operador tenta alterar chave de API sensível -> 403 Forbidden
        const opRes = await fetch(`${baseUrl}/api/settings/test_secret_api_key`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${operatorToken}` },
          body: JSON.stringify({ value: 'ChaveTentativaOperador' })
        });
        assert.strictEqual(opRes.status, 403);

        // 2. Administrador salva chave de API sensível -> 200 OK (mascarada no retorno e criptografada no banco)
        const admRes = await fetch(`${baseUrl}/api/settings/test_secret_api_key`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
          body: JSON.stringify({ value: 'SuperSecretKey2026BelaFarma' })
        });
        assert.strictEqual(admRes.status, 200);
        const admData = await admRes.json();
        assert.ok(admData.value.includes('******'));

        // Verifica no banco SQLite que o valor em repouso está criptografado com AES-256-GCM
        const rawRow = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('test_secret_api_key');
        assert.ok(rawRow.value.startsWith('enc:v1:'), 'Segredo deve estar criptografado em repouso no banco');
        assert.strictEqual(security.decryptSecret(rawRow.value), 'SuperSecretKey2026BelaFarma');

        // 3. Verifica que a Trilha de Auditoria registrou a alteração sem vazar o segredo em texto puro
        const auditRes = await fetch(`${baseUrl}/api/security/audit-logs`, {
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert.strictEqual(auditRes.status, 200);
        const auditData = await auditRes.json();
        assert.ok(auditData.logs.length >= 1);
        assert.strictEqual(auditData.logs[0].action_category, 'SYSTEM_SETTINGS');
        assert.ok(auditData.logs[0].details.includes('[ENCRYPTED_SECRET]'));
      } finally {
        db.prepare('DELETE FROM system_settings WHERE key = ?').run('test_secret_api_key');
        db.prepare('DELETE FROM security_audit_logs WHERE target_id = ?').run('test_secret_api_key');
        server.close();
      }
    });
  });
});
