// =============================================
// Netlify serverless backend - mirrors api.php
// Connects to Neon PostgreSQL via NEON_DATABASE_URL env.
// Deployed as: /.netlify/functions/api
// =============================================

const { Client } = require('pg');

const DATABASE_URL = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

function send(statusCode, data) {
  return {
    statusCode,
    body: JSON.stringify(data),
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  };
}

function requireUserEmail(body) {
  const email = body && body.user_email;
  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw { status: 400, payload: { error: 'invalid_user_email' } };
  }
  return email;
}

/**
 * Open a single client connection, run the query function,
 * then always close the connection.
 */
async function withClient(fn) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

module.exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return send(405, { error: 'method_not_allowed' });
  }

  let body;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (e) {
    return send(400, { error: 'invalid_json' });
  }

  const action = (body && body.action) || '';

  if (!DATABASE_URL) {
    return send(500, { error: 'database_error', message: 'NEON_DATABASE_URL not set' });
  }

  try {
    return await withClient(async (client) => {
      switch (action) {

        // ---------- user_api_keys ----------
        case 'saveKeys': {
          const email = requireUserEmail(body);
          await client.query(
            `INSERT INTO user_api_keys (user_email, groq_key, mistral_key, updated_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (user_email) DO UPDATE
               SET groq_key = EXCLUDED.groq_key,
                   mistral_key = EXCLUDED.mistral_key,
                   updated_at = now()`,
            [email, String(body.groq_key || ''), String(body.mistral_key || '')]
          );
          return send(200, { success: true });
        }

        case 'loadKeys': {
          const email = requireUserEmail(body);
          const r = await client.query(
            'SELECT groq_key, mistral_key FROM user_api_keys WHERE user_email = $1',
            [email]
          );
          const row = r.rows[0];
          return send(200, { groq: (row && row.groq_key) || '', mistral: (row && row.mistral_key) || '' });
        }

        case 'deleteKeys': {
          const email = requireUserEmail(body);
          await client.query('DELETE FROM user_api_keys WHERE user_email = $1', [email]);
          return send(200, { success: true });
        }

        // ---------- chat_sessions ----------
        case 'saveChatSession': {
          const email = requireUserEmail(body);
          const s = body.session || {};
          const created = s.createdAt || null;
          await client.query(
            `INSERT INTO chat_sessions (user_email, session_id, title, messages, created_at, updated_at)
             VALUES ($1, $2, $3, $4::jsonb, COALESCE($5::timestamptz, now()), now())
             ON CONFLICT (user_email, session_id) DO UPDATE
               SET title = EXCLUDED.title,
                   messages = EXCLUDED.messages,
                   updated_at = now()`,
            [email, s.id || '', s.title || 'Chat', JSON.stringify(s.messages || []), created]
          );
          return send(200, { success: true });
        }

        case 'saveAllChatSessions': {
          const email = requireUserEmail(body);
          const sessions = body.sessions || [];
          for (const s of sessions) {
            const created = s.createdAt || null;
            await client.query(
              `INSERT INTO chat_sessions (user_email, session_id, title, messages, created_at, updated_at)
               VALUES ($1, $2, $3, $4::jsonb, COALESCE($5::timestamptz, now()), now())
               ON CONFLICT (user_email, session_id) DO UPDATE
                 SET title = EXCLUDED.title,
                     messages = EXCLUDED.messages,
                     updated_at = now()`,
              [email, s.id || '', s.title || 'Chat', JSON.stringify(s.messages || []), created]
            );
          }
          return send(200, { success: true });
        }

        case 'loadChatSessions': {
          const email = requireUserEmail(body);
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
          return send(200, out);
        }

        case 'deleteChatSession': {
          const email = requireUserEmail(body);
          await client.query(
            'DELETE FROM chat_sessions WHERE user_email = $1 AND session_id = $2',
            [email, body.session_id || '']
          );
          return send(200, { success: true });
        }

        case 'deleteAllChatSessions': {
          const email = requireUserEmail(body);
          await client.query('DELETE FROM chat_sessions WHERE user_email = $1', [email]);
          return send(200, { success: true });
        }

        // ---------- speech_history ----------
        case 'saveSpeechRecord': {
          const email = requireUserEmail(body);
          const r = body.record || {};
          const ts = r.timestamp || null;
          await client.query(
            `INSERT INTO speech_history (user_email, record_type, text, language, model, voice, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()))`,
            [email, r.type || 'TTS', r.text || null, r.language || null, r.model || null, r.voice || null, ts]
          );
          return send(200, { success: true });
        }

        case 'loadSpeechHistory': {
          const email = requireUserEmail(body);
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
          return send(200, out);
        }

        case 'deleteSpeechRecord': {
          const email = requireUserEmail(body);
          await client.query(
            'DELETE FROM speech_history WHERE user_email = $1 AND id = $2',
            [email, body.id || '']
          );
          return send(200, { success: true });
        }

        case 'deleteSpeechRecordByTimestamp': {
          const email = requireUserEmail(body);
          await client.query(
            `DELETE FROM speech_history
             WHERE user_email = $1 AND timestamp = $2::timestamptz AND record_type = $3`,
            [email, body.timestamp || '', body.record_type || '']
          );
          return send(200, { success: true });
        }

        case 'deleteAllSpeechHistory': {
          const email = requireUserEmail(body);
          await client.query('DELETE FROM speech_history WHERE user_email = $1', [email]);
          return send(200, { success: true });
        }

        // ---------- daily_usage ----------
        case 'saveDailyUsage': {
          const email = requireUserEmail(body);
          const groq = parseInt(body.groq_used || 0, 10) || 0;
          const mistral = parseInt(body.mistral_used || 0, 10) || 0;
          const date = body.date || new Date().toISOString().slice(0, 10);
          await client.query(
            `INSERT INTO daily_usage (user_email, date, groq_used, mistral_used, updated_at)
             VALUES ($1, $2, $3, $4, now())
             ON CONFLICT (user_email, date) DO UPDATE
               SET groq_used = EXCLUDED.groq_used,
                   mistral_used = EXCLUDED.mistral_used,
                   updated_at = now()`,
            [email, date, groq, mistral]
          );
          return send(200, { success: true });
        }

        case 'loadDailyUsage': {
          const email = requireUserEmail(body);
          const days = parseInt(body.days || 30, 10) || 30;
          const r = await client.query(
            `SELECT date, groq_used, mistral_used
             FROM daily_usage
             WHERE user_email = $1
               AND date >= CURRENT_DATE - $2::int AND date <= CURRENT_DATE
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
          return send(200, out);
        }

        case 'deleteDailyUsage': {
          const email = requireUserEmail(body);
          await client.query(
            'DELETE FROM daily_usage WHERE user_email = $1 AND date = $2',
            [email, body.date || '']
          );
          return send(200, { success: true });
        }

        // ---------- voice_settings ----------
        case 'saveVoiceSettings': {
          const email = requireUserEmail(body);
          await client.query(
            `INSERT INTO voice_settings (user_email, tts_model, stt_model, voice_ai, auto_speak, updated_at)
             VALUES ($1, $2, $3, $4, $5, now())
             ON CONFLICT (user_email) DO UPDATE
               SET tts_model = EXCLUDED.tts_model,
                   stt_model = EXCLUDED.stt_model,
                   voice_ai = EXCLUDED.voice_ai,
                   auto_speak = EXCLUDED.auto_speak,
                   updated_at = now()`,
            [email,
             body.tts_model || 'canopylabs/orpheus-v1-english',
             body.stt_model || 'whisper-large-v3-turbo',
             body.voice_ai || 'autumn',
             !!body.auto_speak]
          );
          return send(200, { success: true });
        }

        case 'loadVoiceSettings': {
          const email = requireUserEmail(body);
          const r = await client.query(
            'SELECT tts_model, stt_model, voice_ai, auto_speak FROM voice_settings WHERE user_email = $1',
            [email]
          );
          const row = r.rows[0];
          if (!row) return send(200, null);
          const auto = row.auto_speak;
          const autoSpeak = auto === true || auto === 't' || auto === '1' || auto === 1;
          return send(200, {
            ttsModel: row.tts_model,
            sttModel: row.stt_model,
            voiceAI: row.voice_ai,
            autoSpeak,
          });
        }

        // ---------- profiles ----------
        case 'saveProfile': {
          const email = requireUserEmail(body);
          await client.query(
            `INSERT INTO profiles (user_email, name, email, phone, bio, picture, provider, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, now())
             ON CONFLICT (user_email) DO UPDATE SET
               name = EXCLUDED.name,
               email = EXCLUDED.email,
               phone = EXCLUDED.phone,
               bio = EXCLUDED.bio,
               picture = EXCLUDED.picture,
               provider = EXCLUDED.provider,
               updated_at = now()`,
            [email, body.name || null, body.email || null, body.phone || null,
             body.bio || null, body.picture || null, body.provider || 'email']
          );
          return send(200, { success: true });
        }

        case 'loadProfile': {
          const email = requireUserEmail(body);
          const r = await client.query(
            'SELECT name, email, phone, bio, picture, provider, created_at FROM profiles WHERE user_email = $1',
            [email]
          );
          const row = r.rows[0];
          if (!row) return send(200, null);
          return send(200, {
            name: row.name,
            email: row.email,
            phone: row.phone,
            bio: row.bio,
            picture: row.picture,
            provider: row.provider,
            createdAt: row.created_at,
          });
        }

        default:
          return send(400, { error: 'unknown_action' });
      }
    });
  } catch (e) {
    const status = e && e.status;
    if (status && e.payload) {
      return send(status, e.payload);
    }
    console.error('Neon API error (' + action + '):', e.message);
    return send(500, { error: 'database_error', message: 'Database error occurred' });
  }
};
