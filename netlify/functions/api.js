// =============================================
// Netlify serverless backend - mirrors api.php
// Connects to Neon PostgreSQL via NEON_DATABASE_URL env.
// Auth: semua action data butuh JWT (Authorization: Bearer <token>).
// Deployed as: /.netlify/functions/api
// =============================================

const { Client } = require('pg');
const crypto = require('crypto');
const bcryptjs = require('bcryptjs');

const DATABASE_URL = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

const JWT_TTL_REMEMBER = 30 * 24 * 3600;
const JWT_TTL_DEFAULT = 24 * 3600;
const DEFAULT_ORIGINS = [
  'http://localhost',
  'http://127.0.0.1',
  'https://earnest-mooncake-d9b531.netlify.app',
];
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .concat(DEFAULT_ORIGINS);

// -------------------- JWT (HS256) --------------------
function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function jwtCreate(payload, ttlSeconds) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds, jti: crypto.randomBytes(8).toString('hex') };
  const seg1 = b64url(JSON.stringify(header));
  const seg2 = b64url(JSON.stringify(body));
  const sig = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${seg1}.${seg2}`).digest());
  return `${seg1}.${seg2}.${sig}`;
}

function jwtVerify(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [seg1, seg2, sig] = parts;
  const expected = b64url(crypto.createHmac('sha256', JWT_SECRET).update(`${seg1}.${seg2}`).digest());
  if (expected !== sig) return null;
  let payload = null;
  try {
    payload = JSON.parse(Buffer.from(seg2.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  } catch {
    return null;
  }
  if (!payload || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// -------------------- CORS --------------------
function corsOrigin(event) {
  const origin = event.headers && (event.headers.origin || event.headers.Origin);
  if (!origin) return '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : '';
}

function headersFor(event) {
  const origin = corsOrigin(event);
  const h = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (origin) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function send(event, statusCode, data) {
  return { statusCode, body: JSON.stringify(data), headers: headersFor(event) };
}

// -------------------- Auth --------------------
function bearerToken(event) {
  const auth = event.headers && (event.headers.authorization || event.headers.Authorization || '');
  const m = /Bearer\s+(\S+)/i.exec(auth || '');
  return m ? m[1] : '';
}

async function requireAuth(event, body, client) {
  let token = bearerToken(event);
  if (!token && body && body.token) token = body.token;
  if (!token) throw { status: 401, payload: { error: 'unauthorized', message: 'Login diperlukan.' } };
  const payload = jwtVerify(token);
  if (!payload) throw { status: 401, payload: { error: 'invalid_token', message: 'Sesi tidak valid atau sudah kedaluwarsa.' } };
  const email = String(payload.sub || '').toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw { status: 400, payload: { error: 'invalid_user_email' } };
  return email;
}

function publicUser(row) {
  return {
    email: row.user_email || '',
    name: row.name || '',
    picture: row.picture || '',
    provider: row.provider || 'email',
    createdAt: row.created_at || null,
  };
}

// -------------------- Google id_token verification --------------------
async function verifyGoogleToken(credential) {
  if (!credential || typeof credential !== 'string') return null;
  let res;
  try {
    res = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let info;
  try {
    info = await res.json();
  } catch {
    return null;
  }
  if (info.aud !== GOOGLE_CLIENT_ID) return null;
  if (!info.email || !info.email_verified) return null;
  if (info.exp && Number(info.exp) < Math.floor(Date.now() / 1000)) return null;
  return info;
}

// -------------------- Provider helpers (server-side keys) --------------------
async function loadStoredKeys(client, email) {
  const r = await client.query(
    'SELECT groq_key, mistral_key FROM user_api_keys WHERE user_email = $1',
    [email]
  );
  const row = r.rows[0];
  return { groq: (row && String(row.groq_key || '').trim()) || '', mistral: (row && String(row.mistral_key || '').trim()) || '' };
}

function providerUrls(provider) {
  if (provider === 'groq') {
    return {
      chat: 'https://api.groq.com/openai/v1/chat/completions',
      tts: 'https://api.groq.com/openai/v1/audio/speech',
      stt: 'https://api.groq.com/openai/v1/audio/transcriptions',
      models: 'https://api.groq.com/openai/v1/models',
    };
  }
  return {
    chat: 'https://api.mistral.ai/v1/chat/completions',
    tts: 'https://api.mistral.ai/v1/tts',
    stt: 'https://api.mistral.ai/v1/audio/transcriptions',
    models: 'https://api.mistral.ai/v1/models',
  };
}

async function httpJsonRequest(url, bodyArray, apiKey, timeoutMs = 90000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify(bodyArray),
      signal: controller.signal,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = await res.text();
    }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

async function httpGetRequest(url, apiKey, timeoutMs = 30000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + apiKey },
      signal: controller.signal,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = await res.text();
    }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

function buildMultipart(fields, fileField, filename, mime, fileData) {
  const boundary = '----WebAi' + crypto.randomBytes(8).toString('hex');
  let body = '';
  for (const [k, v] of Object.entries(fields)) {
    body += `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`;
  }
  body += `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${filename}"\r\n`;
  body += `Content-Type: ${mime}\r\n\r\n`;
  body += fileData;
  body += `\r\n--${boundary}--\r\n`;
  return { boundary, body };
}

async function httpMultipartRequest(url, fileField, fields, fileData, filename, mime, apiKey, timeoutMs = 90000) {
  const { boundary, body } = buildMultipart(fields, fileField, filename, mime, fileData);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        Authorization: 'Bearer ' + apiKey,
      },
      body,
      signal: controller.signal,
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = await res.text();
    }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Open a single client connection, run the query function,
 * then always close the connection.
 */
async function withClient(fn) {
    // Neon mengharuskan TLS; tanpa opsi ssl handshake di Function serverless
    // sering mandek / kena cold-start Neon → timeout Netlify → 500 database_error.
    const client = new Client({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
      statement_timeout: 15000,
      query_timeout: 15000,
    });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

module.exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, body: '', headers: headersFor(event) };
  }
  if (event.httpMethod !== 'POST') {
    return send(event, 405, { error: 'method_not_allowed' });
  }

  let body;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (e) {
    return send(event, 400, { error: 'invalid_json' });
  }

  const action = (body && body.action) || '';

  if (!DATABASE_URL) {
    return send(event, 500, { error: 'database_error', message: 'NEON_DATABASE_URL not set' });
  }

  try {
    return await withClient(async (client) => {
      switch (action) {

        // ==================== AUTH (tanpa JWT) ====================
        case 'register': {
          const name = String(body.name || '').trim();
          const email = String(body.email || '').toLowerCase().trim();
          const password = String(body.password || '');
          const remember = !!body.remember;
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return send(event, 400, { error: 'invalid_email', message: 'Email tidak valid.' });
          }
          if (password.length < 6) {
            return send(event, 400, { error: 'password_too_short', message: 'Password minimal 6 karakter.' });
          }
          const exists = await client.query('SELECT 1 FROM users WHERE user_email = $1', [email]);
          if (exists.rows.length > 0) {
            return send(event, 409, { error: 'email_taken', message: 'Email sudah terdaftar.' });
          }
          const hash = bcryptjs.hashSync(password, 10);
          await client.query(
            `INSERT INTO users (user_email, name, password_hash, provider) VALUES ($1, $2, $3, 'email')`,
            [email, name === '' ? email : name, hash]
          );
          const r = await client.query('SELECT user_email, name, picture, provider, created_at FROM users WHERE user_email = $1', [email]);
          const token = jwtCreate({ sub: email }, remember ? JWT_TTL_REMEMBER : JWT_TTL_DEFAULT);
          return send(event, 200, { success: true, token, user: publicUser(r.rows[0]) });
        }

        case 'login': {
          const email = String(body.email || '').toLowerCase().trim();
          const password = String(body.password || '');
          const remember = !!body.remember;
          const r = await client.query('SELECT * FROM users WHERE user_email = $1', [email]);
          const row = r.rows[0];
          if (!row || !row.password_hash || !bcryptjs.compareSync(password, row.password_hash)) {
            return send(event, 401, { error: 'invalid_credentials', message: 'Email atau password salah.' });
          }
          try {
            if (bcryptjs.getRounds(row.password_hash) < 10) {
              await client.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE user_email = $2',
                [bcryptjs.hashSync(password, 10), email]);
            }
          } catch (e) { /* hash lama non-bcrypt -> biarkan */ }
          const token = jwtCreate({ sub: email }, remember ? JWT_TTL_REMEMBER : JWT_TTL_DEFAULT);
          return send(event, 200, { success: true, token, user: publicUser(row) });
        }

        case 'googleLogin': {
          const info = await verifyGoogleToken(body.credential || '');
          if (!info) {
            return send(event, 401, { error: 'invalid_google_token', message: 'Verifikasi token Google gagal.' });
          }
          let accountEmail = String(info.email).toLowerCase();
          const sub = String(info.sub || '');
          const name = String(info.name || '');
          const picture = String(info.picture || '');
          const found = await client.query(
            'SELECT * FROM users WHERE google_sub = $1 OR user_email = $2 ORDER BY user_email LIMIT 1',
            [sub, accountEmail]
          );
          let row = found.rows[0];
          if (row) {
            await client.query(
              `UPDATE users SET name = COALESCE(NULLIF($1,''), name), picture = COALESCE(NULLIF($2,''), picture),
                google_sub = COALESCE(google_sub, $3), provider = 'google', updated_at = now() WHERE user_email = $4`,
              [name, picture, sub, row.user_email]
            );
            accountEmail = row.user_email;
          } else {
            await client.query(
              `INSERT INTO users (user_email, name, password_hash, provider, google_sub, picture)
               VALUES ($1, $2, NULL, 'google', $3, $4)`,
              [accountEmail, name === '' ? accountEmail : name, sub, picture]
            );
          }
          const r = await client.query('SELECT user_email, name, picture, provider, created_at FROM users WHERE user_email = $1', [accountEmail]);
          const token = jwtCreate({ sub: accountEmail }, JWT_TTL_REMEMBER);
          return send(event, 200, { success: true, token, user: publicUser(r.rows[0]) });
        }

        // ==================== AUTH (butuh JWT) ====================
        case 'authCheck': {
          const email = await requireAuth(event, body, client);
          const r = await client.query('SELECT user_email, name, picture, provider, created_at FROM users WHERE user_email = $1', [email]);
          if (!r.rows[0]) return send(event, 404, { error: 'user_not_found' });
          // Sliding refresh: issue new token with extended TTL
          const newToken = jwtCreate({ sub: email }, JWT_TTL_DEFAULT);
          return send(event, 200, { user: publicUser(r.rows[0]), token: newToken });
        }

        case 'changePassword': {
          const email = await requireAuth(event, body, client);
          const current = String(body.current_password || '');
          const next = String(body.new_password || '');
          if (next.length < 6) return send(event, 400, { error: 'password_too_short', message: 'Password baru minimal 6 karakter.' });
          const r = await client.query('SELECT password_hash FROM users WHERE user_email = $1', [email]);
          const row = r.rows[0];
          if (!row || !row.password_hash) return send(event, 400, { error: 'google_account', message: 'Akun Google tidak memakai password.' });
          if (!bcryptjs.compareSync(current, row.password_hash)) return send(event, 401, { error: 'wrong_password', message: 'Password saat ini salah.' });
          await client.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE user_email = $2',
            [bcryptjs.hashSync(next, 10), email]);
          return send(event, 200, { success: true });
        }

        // ------------------ Proxy Groq / Mistral (server-side) ------------------
        case 'proxyChat': {
          const email = await requireAuth(event, body, client);
          const provider = String(body.provider || '').toLowerCase();
          if (provider !== 'groq' && provider !== 'mistral') return send(event, 400, { error: 'invalid_provider' });
          const keys = await loadStoredKeys(client, email);
          const apiKey = keys[provider];
          if (!apiKey) return send(event, 401, { ok: false, status: 401, error: { error: { message: `API key ${provider} belum dikonfigurasi.` } } });
          const res = await httpJsonRequest(providerUrls(provider).chat, {
            model: body.model || '',
            messages: body.messages || [],
            max_tokens: body.max_tokens != null ? parseInt(body.max_tokens, 10) : 1024,
            temperature: body.temperature != null ? parseFloat(body.temperature) : 0.7,
          }, apiKey);
          return send(event, res.ok ? 200 : 502, res);
        }

        case 'proxyTts': {
          const email = await requireAuth(event, body, client);
          const provider = String(body.provider || 'groq').toLowerCase();
          if (provider !== 'groq' && provider !== 'mistral') return send(event, 400, { error: 'invalid_provider' });
          const keys = await loadStoredKeys(client, email);
          const apiKey = keys[provider];
          if (!apiKey) return send(event, 401, { ok: false, status: 401, error: { error: { message: `API key ${provider} belum dikonfigurasi.` } } });
          const text = String(body.input || body.text || '');
          if (!text) return send(event, 400, { ok: false, status: 400, error: { message: 'Teks kosong.' } });
          const payload = provider === 'groq'
            ? { model: body.model || 'canopylabs/orpheus-v1-english', input: text, voice: body.voice || 'autumn', response_format: body.response_format || 'wav' }
            : { model: body.model || 'tts-1', text, voice: body.voice || 'alloy' };
          const mime = provider === 'groq' && (body.response_format === 'mp3') ? 'audio/mpeg' : provider === 'groq' ? 'audio/wav' : 'audio/mpeg';
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), 90000);
          try {
            const res = await fetch(providerUrls(provider).tts, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
              body: JSON.stringify(payload),
              signal: controller.signal,
            });
            const buf = Buffer.from(await res.arrayBuffer());
            if (res.ok) {
              return send(event, 200, { ok: true, status: res.status, base64: buf.toString('base64'), mimeType: mime });
            }
            let errData = null;
            try { errData = JSON.parse(buf.toString()); } catch { errData = buf.toString(); }
            return send(event, 502, { ok: false, status: res.status, error: errData });
          } finally {
            clearTimeout(t);
          }
        }

        case 'proxyStt': {
          const email = await requireAuth(event, body, client);
          const provider = String(body.provider || 'groq').toLowerCase();
          if (provider !== 'groq' && provider !== 'mistral') return send(event, 400, { error: 'invalid_provider' });
          const keys = await loadStoredKeys(client, email);
          const apiKey = keys[provider];
          if (!apiKey) return send(event, 401, { ok: false, status: 401, error: { error: { message: `API key ${provider} belum dikonfigurasi.` } } });
          const audio = Buffer.from(String(body.base64 || ''), 'base64');
          if (!audio.length) return send(event, 400, { ok: false, status: 400, error: { message: 'Tidak ada audio yang valid.' } });
          const model = body.model || (provider === 'groq' ? 'whisper-large-v3-turbo' : 'voxtral-mini-latest');
          const filename = body.filename || 'recording.webm';
          const mime = body.mime_type || 'audio/webm';
          const res = await httpMultipartRequest(
            providerUrls(provider).stt, 'file', { model, response_format: 'json' },
            audio, filename, mime, apiKey
          );
          return send(event, res.ok ? 200 : 502, res);
        }

        case 'validateKey': {
          const email = await requireAuth(event, body, client);
          const provider = String(body.provider || '').toLowerCase();
          if (provider !== 'groq' && provider !== 'mistral') return send(event, 400, { error: 'invalid_provider' });
          const keys = await loadStoredKeys(client, email);
          const apiKey = keys[provider];
          if (!apiKey) return send(event, 401, { ok: false, status: 401, data: null });
          const res = await httpGetRequest(providerUrls(provider).models, apiKey);
          return send(event, res.ok ? 200 : 502, { ok: res.ok, status: res.status, data: res.data });
        }

        // ---------- user_api_keys ----------
        case 'saveKeys': {
          const email = await requireAuth(event, body, client);
          await client.query(
            `INSERT INTO user_api_keys (user_email, groq_key, mistral_key, updated_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (user_email) DO UPDATE
               SET groq_key = EXCLUDED.groq_key, mistral_key = EXCLUDED.mistral_key, updated_at = now()`,
            [email, String(body.groq_key || '').trim(), String(body.mistral_key || '').trim()]
          );
          return send(event, 200, { success: true });
        }

        case 'loadKeys': {
          const email = await requireAuth(event, body, client);
          const r = await client.query('SELECT groq_key, mistral_key FROM user_api_keys WHERE user_email = $1', [email]);
          const row = r.rows[0];
          // Key TIDAK dikirim ke browser.
          return send(event, 200, { groq: !!(row && row.groq_key), mistral: !!(row && row.mistral_key) });
        }

        case 'deleteKeys': {
          const email = await requireAuth(event, body, client);
          await client.query('DELETE FROM user_api_keys WHERE user_email = $1', [email]);
          return send(event, 200, { success: true });
        }

        // ---------- chat_sessions ----------
        case 'saveChatSession': {
          const email = await requireAuth(event, body, client);
          const s = body.session || {};
          const created = s.createdAt || null;
          await client.query(
            `INSERT INTO chat_sessions (user_email, session_id, title, messages, created_at, updated_at)
             VALUES ($1, $2, $3, $4::jsonb, COALESCE($5::timestamptz, now()), now())
             ON CONFLICT (user_email, session_id) DO UPDATE
               SET title = EXCLUDED.title, messages = EXCLUDED.messages, updated_at = now()`,
            [email, s.id || '', s.title || 'Chat', JSON.stringify(s.messages || []), created]
          );
          return send(event, 200, { success: true });
        }

        case 'saveAllChatSessions': {
          const email = await requireAuth(event, body, client);
          const sessions = body.sessions || [];
          for (const s of sessions) {
            const created = s.createdAt || null;
            await client.query(
              `INSERT INTO chat_sessions (user_email, session_id, title, messages, created_at, updated_at)
               VALUES ($1, $2, $3, $4::jsonb, COALESCE($5::timestamptz, now()), now())
               ON CONFLICT (user_email, session_id) DO UPDATE
                 SET title = EXCLUDED.title, messages = EXCLUDED.messages, updated_at = now()`,
              [email, s.id || '', s.title || 'Chat', JSON.stringify(s.messages || []), created]
            );
          }
          return send(event, 200, { success: true });
        }

        case 'loadChatSessions': {
          const email = await requireAuth(event, body, client);
          const r = await client.query(
            `SELECT session_id, title, messages, created_at, updated_at
             FROM chat_sessions WHERE user_email = $1 ORDER BY created_at DESC`,
            [email]
          );
          const out = r.rows.map((row) => ({
            id: row.session_id,
            title: row.title,
            messages: typeof row.messages === 'string' ? JSON.parse(row.messages) : (row.messages || []),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          }));
          return send(event, 200, out);
        }

        case 'deleteChatSession': {
          const email = await requireAuth(event, body, client);
          await client.query('DELETE FROM chat_sessions WHERE user_email = $1 AND session_id = $2', [email, body.session_id || '']);
          return send(event, 200, { success: true });
        }

        case 'deleteAllChatSessions': {
          const email = await requireAuth(event, body, client);
          await client.query('DELETE FROM chat_sessions WHERE user_email = $1', [email]);
          return send(event, 200, { success: true });
        }

        // ---------- speech_history ----------
        case 'saveSpeechRecord': {
          const email = await requireAuth(event, body, client);
          const r = body.record || {};
          const ts = r.timestamp || null;
          await client.query(
            `INSERT INTO speech_history (user_email, record_type, text, language, model, voice, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()))`,
            [email, r.type || 'TTS', r.text || null, r.language || null, r.model || null, r.voice || null, ts]
          );
          return send(event, 200, { success: true });
        }

        case 'loadSpeechHistory': {
          const email = await requireAuth(event, body, client);
          const r = await client.query(
            `SELECT id, record_type, text, language, model, voice, timestamp
             FROM speech_history WHERE user_email = $1 ORDER BY timestamp DESC LIMIT 50`,
            [email]
          );
          const out = r.rows.map((row) => ({
            id: row.id,
            type: row.record_type,
            text: row.text,
            language: row.language,
            model: row.model,
            voice: row.voice,
            timestamp: row.timestamp,
          }));
          return send(event, 200, out);
        }

        case 'deleteSpeechRecord': {
          const email = await requireAuth(event, body, client);
          await client.query('DELETE FROM speech_history WHERE user_email = $1 AND id = $2', [email, body.id || '']);
          return send(event, 200, { success: true });
        }

        case 'deleteSpeechRecordByTimestamp': {
          const email = await requireAuth(event, body, client);
          await client.query(
            `DELETE FROM speech_history WHERE user_email = $1 AND timestamp = $2::timestamptz AND record_type = $3`,
            [email, body.timestamp || '', body.record_type || '']
          );
          return send(event, 200, { success: true });
        }

        case 'deleteAllSpeechHistory': {
          const email = await requireAuth(event, body, client);
          await client.query('DELETE FROM speech_history WHERE user_email = $1', [email]);
          return send(event, 200, { success: true });
        }

        // ---------- daily_usage ----------
        case 'saveDailyUsage': {
          const email = await requireAuth(event, body, client);
          const groq = parseInt(body.groq_used || 0, 10) || 0;
          const mistral = parseInt(body.mistral_used || 0, 10) || 0;
          const date = body.date || new Date().toISOString().slice(0, 10);
          await client.query(
            `INSERT INTO daily_usage (user_email, date, groq_used, mistral_used, updated_at)
             VALUES ($1, $2, $3, $4, now())
             ON CONFLICT (user_email, date) DO UPDATE
               SET groq_used = EXCLUDED.groq_used, mistral_used = EXCLUDED.mistral_used, updated_at = now()`,
            [email, date, groq, mistral]
          );
          return send(event, 200, { success: true });
        }

        case 'loadDailyUsage': {
          const email = await requireAuth(event, body, client);
          const days = parseInt(body.days || 30, 10) || 30;
          const r = await client.query(
            `SELECT date, groq_used, mistral_used FROM daily_usage
             WHERE user_email = $1 AND date >= CURRENT_DATE - $2::int AND date <= CURRENT_DATE
             ORDER BY date DESC`,
            [email, days]
          );
          const out = r.rows.map((row) => {
            const g = parseInt(row.groq_used, 10) || 0;
            const m = parseInt(row.mistral_used, 10) || 0;
            return {
              date: row.date,
              groq_used: g,
              mistral_used: m,
              groq_remaining: 12000 - g,
              mistral_remaining: 12000 - m,
              dateFormatted: String(row.date),
            };
          });
          return send(event, 200, out);
        }

        case 'deleteDailyUsage': {
          const email = await requireAuth(event, body, client);
          await client.query('DELETE FROM daily_usage WHERE user_email = $1 AND date = $2', [email, body.date || '']);
          return send(event, 200, { success: true });
        }

        // ---------- voice_settings ----------
        case 'saveVoiceSettings': {
          const email = await requireAuth(event, body, client);
          await client.query(
            `INSERT INTO voice_settings (user_email, tts_model, stt_model, voice_ai, auto_speak, updated_at)
             VALUES ($1, $2, $3, $4, $5, now())
             ON CONFLICT (user_email) DO UPDATE
               SET tts_model = EXCLUDED.tts_model, stt_model = EXCLUDED.stt_model,
                   voice_ai = EXCLUDED.voice_ai, auto_speak = EXCLUDED.auto_speak, updated_at = now()`,
            [email,
             body.tts_model || 'canopylabs/orpheus-v1-english',
             body.stt_model || 'whisper-large-v3-turbo',
             body.voice_ai || 'autumn',
             !!body.auto_speak]
          );
          return send(event, 200, { success: true });
        }

        case 'loadVoiceSettings': {
          const email = await requireAuth(event, body, client);
          const r = await client.query('SELECT tts_model, stt_model, voice_ai, auto_speak FROM voice_settings WHERE user_email = $1', [email]);
          const row = r.rows[0];
          if (!row) return send(event, 200, null);
          const auto = row.auto_speak;
          const autoSpeak = auto === true || auto === 't' || auto === '1' || auto === 1;
          return send(event, 200, { ttsModel: row.tts_model, sttModel: row.stt_model, voiceAI: row.voice_ai, autoSpeak });
        }

        // ---------- profiles ----------
        case 'saveProfile': {
          const email = await requireAuth(event, body, client);
          await client.query(
            `INSERT INTO profiles (user_email, name, email, phone, bio, picture, provider, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, now())
             ON CONFLICT (user_email) DO UPDATE SET
               name = EXCLUDED.name, email = EXCLUDED.email, phone = EXCLUDED.phone,
               bio = EXCLUDED.bio, picture = EXCLUDED.picture, provider = EXCLUDED.provider, updated_at = now()`,
            [email, body.name || null, body.email || null, body.phone || null,
             body.bio || null, body.picture || null, body.provider || 'email']
          );
          return send(event, 200, { success: true });
        }

        case 'loadProfile': {
          const email = await requireAuth(event, body, client);
          const r = await client.query('SELECT name, email, phone, bio, picture, provider, created_at FROM profiles WHERE user_email = $1', [email]);
          const row = r.rows[0];
          if (!row) return send(event, 200, null);
          return send(event, 200, {
            name: row.name, email: row.email, phone: row.phone, bio: row.bio,
            picture: row.picture, provider: row.provider, createdAt: row.created_at,
          });
        }

        // ---------- notes ----------
        case 'saveAllNotes': {
          const email = await requireAuth(event, body, client);
          const notes = Array.isArray(body.notes) ? body.notes : [];
          for (const n of notes) {
            if (!n || !n.id) continue;
            await client.query(
              `INSERT INTO notes (user_email, note_id, title, content, category, color, pinned, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, now()), now())
               ON CONFLICT (user_email, note_id) DO UPDATE
                 SET title = EXCLUDED.title, content = EXCLUDED.content, category = EXCLUDED.category,
                     color = EXCLUDED.color, pinned = EXCLUDED.pinned, updated_at = now()`,
              [email, String(n.id), n.title || null, n.content || '', n.category || 'Umum',
               n.color || '', !!n.pinned, n.createdAt || null]
            );
          }
          return send(event, 200, { success: true });
        }

        case 'loadNotes': {
          const email = await requireAuth(event, body, client);
          const r = await client.query(
            `SELECT note_id, title, content, category, color, pinned, created_at, updated_at
             FROM notes WHERE user_email = $1 ORDER BY pinned DESC, updated_at DESC`,
            [email]
          );
          const out = r.rows.map((row) => {
            const pin = row.pinned;
            return {
              id: row.note_id,
              title: row.title,
              content: row.content,
              category: row.category,
              color: row.color,
              pinned: pin === true || pin === 't' || pin === '1' || pin === 1,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            };
          });
          return send(event, 200, out);
        }

        case 'deleteNote': {
          const email = await requireAuth(event, body, client);
          await client.query('DELETE FROM notes WHERE user_email = $1 AND note_id = $2', [email, body.note_id || '']);
          return send(event, 200, { success: true });
        }

        case 'deleteAllNotes': {
          const email = await requireAuth(event, body, client);
          await client.query('DELETE FROM notes WHERE user_email = $1', [email]);
          return send(event, 200, { success: true });
        }

        default:
          return send(event, 400, { error: 'unknown_action' });
      }
    });
  } catch (e) {
    const status = e && e.status;
    if (status && e.payload) {
      return send(event, status, e.payload);
    }
    console.error('Neon API error (' + action + '):', e.message);
    const pgCode = (e && e.code) || (e && e.context && e.context.code) || '';
    const dbEnvConfigured = !!(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL);
    return send(event, 500, {
      error: 'database_error',
      message: 'Terjadi kesalahan server.',
      dbEnvConfigured,
      pgCode: String(pgCode || (e && String(e.message || '').split('\n')[0].slice(0, 80)))
    });
  }
};