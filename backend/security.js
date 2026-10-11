const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Diretório persistente para armazenar o segredo JWT caso não esteja definido no .env
const DATA_DIR = process.platform === 'win32'
  ? path.join(__dirname)
  : path.join(__dirname, 'data');

const SECRET_FILE = path.join(DATA_DIR, '.jwt_secret');

let cachedJwtSecret = null;
const internalKey = crypto.randomBytes(32).toString('hex');

function getJwtSecret() {
  if (cachedJwtSecret) return cachedJwtSecret;

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16) {
    cachedJwtSecret = process.env.JWT_SECRET.trim();
    return cachedJwtSecret;
  }

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(SECRET_FILE)) {
      const saved = fs.readFileSync(SECRET_FILE, 'utf-8').trim();
      if (saved.length >= 32) {
        cachedJwtSecret = saved;
        return cachedJwtSecret;
      }
    }
    const generated = crypto.randomBytes(64).toString('hex');
    fs.writeFileSync(SECRET_FILE, generated, { encoding: 'utf-8', mode: 0o600 });
    cachedJwtSecret = generated;
    return cachedJwtSecret;
  } catch (err) {
    console.warn('[Security] Aviso ao persistir .jwt_secret, usando chave em memória:', err.message);
    cachedJwtSecret = crypto.randomBytes(64).toString('hex');
    return cachedJwtSecret;
  }
}

function getInternalKey() {
  return internalKey;
}

// ============================================================================
// JWT (HMAC-SHA256 Nativo sem dependências externas)
// ============================================================================
function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf-8');
  return buf.toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecodeToString(input) {
  let str = String(input).replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4 !== 0) {
    str += '=';
  }
  return Buffer.from(str, 'base64').toString('utf-8');
}

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 dias
const COOKIE_NAME = 'belinha_token';

function signToken(user, ttlSeconds = TOKEN_TTL_SECONDS) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: String(user.id),
    id: String(user.id),
    name: String(user.name || ''),
    role: String(user.role || 'Operador'),
    jobRole: user.jobRole ? String(user.jobRole) : undefined,
    iat: now,
    exp: now + ttlSeconds
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', getJwtSecret())
    .update(signingInput)
    .digest();

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const expectedSig = base64UrlEncode(
    crypto.createHmac('sha256', getJwtSecret()).update(signingInput).digest()
  );

  const sigBuf = Buffer.from(encodedSignature, 'utf-8');
  const expBuf = Buffer.from(expectedSig, 'utf-8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecodeToString(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < now) {
      return null;
    }
    return payload;
  } catch (e) {
    return null;
  }
}

// ============================================================================
// Cookies & Extração de Credenciais
// ============================================================================
function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return list;

  cookieHeader.split(';').forEach((cookie) => {
    const idx = cookie.indexOf('=');
    if (idx > 0) {
      const key = cookie.slice(0, idx).trim();
      const val = cookie.slice(idx + 1).trim();
      try {
        list[key] = decodeURIComponent(val);
      } catch {
        list[key] = val;
      }
    }
  });
  return list;
}

function extractToken(req) {
  // 1. Header Authorization: Bearer <token>
  const authHeader = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  // 2. Cookie HttpOnly (belinha_token)
  const cookies = parseCookies(req.headers && req.headers.cookie);
  if (cookies[COOKIE_NAME]) {
    return cookies[COOKIE_NAME];
  }

  // 3. Query param opcional (ex: EventSource ou download autenticado)
  if (req.query && req.query.auth_token) {
    return String(req.query.auth_token);
  }

  return null;
}

function setAuthCookie(req, res, token) {
  const isSecure = req.secure || (req.headers && req.headers['x-forwarded-proto'] === 'https');
  const cookieParts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Max-Age=${TOKEN_TTL_SECONDS}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (isSecure) {
    cookieParts.push('Secure');
  }
  res.setHeader('Set-Cookie', cookieParts.join('; '));
}

function clearAuthCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`
  );
}

// ============================================================================
// Hashing de Chaves de Acesso (scrypt + compatibilidade legada transparente)
// ============================================================================
function normalizeAccessKey(rawKey) {
  return String(rawKey || '').trim().toLowerCase();
}

function hashAccessKey(rawKey) {
  const normalized = normalizeAccessKey(rawKey);
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(normalized, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyAccessKey(inputKey, storedPlainOrHash, storedHashColumn = null) {
  const normalizedInput = normalizeAccessKey(inputKey);
  if (!normalizedInput) return false;

  const candidateHash = (storedHashColumn && String(storedHashColumn).startsWith('scrypt$'))
    ? String(storedHashColumn)
    : (storedPlainOrHash && String(storedPlainOrHash).startsWith('scrypt$') ? String(storedPlainOrHash) : null);

  if (candidateHash) {
    const parts = candidateHash.split('$');
    if (parts.length === 3) {
      const [, salt, hashHex] = parts;
      try {
        const derived = crypto.scryptSync(normalizedInput, salt, 64);
        const expected = Buffer.from(hashHex, 'hex');
        if (derived.length === expected.length && crypto.timingSafeEqual(derived, expected)) {
          return true;
        }
      } catch (e) {
        return false;
      }
    }
  }

  // Fallback seguro em tempo constante para chave em texto puro (legado)
  if (storedPlainOrHash && !String(storedPlainOrHash).startsWith('scrypt$')) {
    const normalizedStored = normalizeAccessKey(storedPlainOrHash);
    const bufA = crypto.createHash('sha256').update(normalizedInput).digest();
    const bufB = crypto.createHash('sha256').update(normalizedStored).digest();
    return crypto.timingSafeEqual(bufA, bufB);
  }

  return false;
}

function sanitizeUser(user) {
  if (!user) return null;
  const { accessKey, accessKeyHash, ...safeUser } = user;
  return safeUser;
}

function isAdminUser(user) {
  if (!user) return false;
  const roleStr = String(user.role || '').toUpperCase();
  const jobStr = String(user.jobRole || '').toUpperCase();
  return (
    roleStr === 'ADMINISTRADOR' ||
    roleStr.includes('ADM') ||
    roleStr.includes('GERENTE') ||
    jobStr.includes('GERENTE')
  );
}

// ============================================================================
// Rate Limiting para Login (Proteção contra Força Bruta)
// ============================================================================
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutos

function getClientIp(req) {
  const xff = req.headers && req.headers['x-forwarded-for'];
  if (xff && typeof xff === 'string') {
    return xff.split(',')[0].trim();
  }
  return (req.ip || (req.connection && req.connection.remoteAddress) || 'unknown');
}

function checkLoginRateLimit(req) {
  const ip = getClientIp(req);
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record) return { allowed: true, remaining: MAX_LOGIN_ATTEMPTS };

  if (now - record.firstAttemptAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(ip);
    return { allowed: true, remaining: MAX_LOGIN_ATTEMPTS };
  }

  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    const retryAfterSec = Math.ceil((LOGIN_WINDOW_MS - (now - record.firstAttemptAt)) / 1000);
    return { allowed: false, retryAfterSec };
  }

  return { allowed: true, remaining: MAX_LOGIN_ATTEMPTS - record.count };
}

function recordLoginFailure(req) {
  const ip = getClientIp(req);
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record || now - record.firstAttemptAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAttemptAt: now });
  } else {
    record.count += 1;
  }
}

function clearLoginFailures(req) {
  const ip = getClientIp(req);
  loginAttempts.delete(ip);
}

// Limpeza periódica do mapa de tentativas a cada 30 min
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of loginAttempts.entries()) {
    if (now - rec.firstAttemptAt > LOGIN_WINDOW_MS) {
      loginAttempts.delete(ip);
    }
  }
}, 30 * 60 * 1000).unref();

// ============================================================================
// Middlewares de Segurança HTTP, Autenticação e Autorização
// ============================================================================
function securityHeadersMiddleware(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
}

// Rotas públicas que NÃO exigem sessão de colaborador (Vitrine, Login, Webhooks, RPA)
function isPublicApiRoute(req) {
  const reqPath = (req.path || req.url || '').split('?')[0];
  const method = (req.method || 'GET').toUpperCase();

  if (method === 'OPTIONS') return true;

  // Autenticação e versão
  if (reqPath === '/login' || reqPath === '/logout' || reqPath === '/auth/session' || reqPath === '/version') {
    return true;
  }

  // Vitrine Pública de Ofertas e Analytics
  if (reqPath.startsWith('/liquidacao/public/')) {
    return true;
  }

  // Registro de visitantes (Vitrine / App)
  if (reqPath === '/system/visitors/record' && method === 'POST') {
    return true;
  }

  // Webhook da Evolution API (WhatsApp)
  if (reqPath === '/webhook/evolution' && method === 'POST') {
    return true;
  }

  // Endpoints do Agente RPA Windows (possuem validação própria de ?token=)
  if (reqPath === '/whatsapp/agent/pending' || reqPath === '/whatsapp/agent/report') {
    return true;
  }

  // Feeds públicos de catálogo CSV (Meta/WhatsApp Business Catalog)
  if (
    reqPath === '/whatsapp-vendas/catalog/export-csv' ||
    reqPath === '/whatsapp-vendas/catalog/feed.csv' ||
    reqPath === '/catalog/whatsapp.csv'
  ) {
    return true;
  }

  return false;
}

function apiAuthMiddleware(req, res, next) {
  // 1. Chamadas internas do próprio servidor (ex: system-endpoints acionando backup)
  if (req.headers && req.headers['x-internal-key'] === internalKey) {
    req.user = { id: 'system-internal', name: 'Sistema Interno', role: 'Administrador' };
    return next();
  }

  // 2. Rotas públicas (Vitrine, Login, Webhooks, Agente RPA)
  if (isPublicApiRoute(req)) {
    const optionalToken = extractToken(req);
    if (optionalToken) {
      const payload = verifyToken(optionalToken);
      if (payload) req.user = payload;
    }
    return next();
  }

  // 3. Rotas protegidas exigem token válido
  const token = extractToken(req);
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({
      error: 'Acesso não autorizado. Faça login novamente.',
      code: 'UNAUTHORIZED'
    });
  }

  req.user = payload;
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.user || !isAdminUser(req.user)) {
    return res.status(403).json({
      error: 'Acesso restrito a administradores.',
      code: 'FORBIDDEN_ADMIN_ONLY'
    });
  }
  return next();
}

// ============================================================================
// Sanitização de Uploads e Proteção contra Path Traversal
// ============================================================================
const BLOCKED_UPLOAD_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.php', '.phtml', '.phar',
  '.js', '.cjs', '.mjs', '.ts', '.vbs', '.ps1', '.scr',
  '.dll', '.msi', '.com', '.jar', '.jsp', '.asp', '.aspx',
  '.py', '.rb', '.pl', '.cgi', '.htaccess', '.env'
]);

function isSafeUploadFile(filename) {
  if (!filename || typeof filename !== 'string') return false;
  const ext = path.extname(filename).toLowerCase();
  if (BLOCKED_UPLOAD_EXTENSIONS.has(ext)) {
    return false;
  }
  return true;
}

function sanitizeBackupFilename(filename) {
  if (!filename || typeof filename !== 'string') return null;
  const base = path.basename(filename);
  if (base !== filename || base.includes('..') || base.includes('/') || base.includes('\\')) {
    return null;
  }
  if (!base.endsWith('.db') && !base.endsWith('.sqlite')) {
    return null;
  }
  return base;
}

module.exports = {
  COOKIE_NAME,
  getJwtSecret,
  getInternalKey,
  signToken,
  verifyToken,
  extractToken,
  setAuthCookie,
  clearAuthCookie,
  hashAccessKey,
  verifyAccessKey,
  sanitizeUser,
  isAdminUser,
  checkLoginRateLimit,
  recordLoginFailure,
  clearLoginFailures,
  securityHeadersMiddleware,
  apiAuthMiddleware,
  requireAdmin,
  isSafeUploadFile,
  sanitizeBackupFilename,
  isPublicApiRoute
};
