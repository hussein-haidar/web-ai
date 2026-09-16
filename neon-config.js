// =============================================
// Neon PostgreSQL backend client
// All credentials live server-side.
// - Localhost (XAMPP): served by api.php (PHP)
// - Netlify: served by serverless function /.netlify/functions/api
// These neon* functions are the cloud storage layer used by
// the rest of the app (script.js, auth.js).
// =============================================

(function () {
    const host = window.location.hostname || '';
    const isNetlify =
        host.indexOf('netlify.app') !== -1 ||
        host.indexOf('netlify.app.') !== -1;
    const NEON_API_URL = isNetlify ? '/.netlify/functions/api' : 'api.php';
    window.__NEON_API_URL = NEON_API_URL;
})()

// Internal helper: POST JSON to backend (api.php or Netlify function)
async function _neonPost(action, extra = {}) {
    const token = localStorage.getItem('userToken');
    if (!token) {
        const err = new Error('not_authenticated');
        err.notAuth = true;
        throw err;
    }
    const body = Object.assign({ action }, extra);
    const res = await fetch(window.__NEON_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify(body)
    });
    let data = null;
    try {
        data = await res.json();
    } catch (e) {
        data = null;
    }
    if (!res.ok) {
        const errMsg = (data && data.error) || ('Neon API error ' + res.status);
        // Sesi kedaluwarsa / JWT tidak valid → paksa logout client
        if (res.status === 401 && (data?.error === 'invalid_token' || data?.error === 'unauthorized')) {
            localStorage.removeItem('userToken');
            localStorage.removeItem('userInfo');
            window.location.href = 'login.html';
        }
        const err = new Error(data && data.message ? data.message : errMsg);
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return data;
}

// =============================================
// Server-Side Provider Proxy (keys never reach browser)
// The real Groq/Mistral keys stay in the DB. The backend
// (api.php / Netlify function) attaches them and forwards.
// All responses are JSON. Chat/STT/validate return {ok,status,data}
// where data is the provider JSON; TTS returns {ok,status,base64,mimeType}.
// =============================================

async function neonProxyChat(provider, model, messages, max_tokens = 1024, temperature = 0.7) {
    return _neonPost('proxyChat', { provider, model, messages, max_tokens, temperature });
}

async function neonProxyTts(provider, text, model, voice, response_format = 'wav') {
    return _neonPost('proxyTts', { provider, text, model, voice, response_format });
}

async function neonProxyStt(provider, base64Audio, model, filename = 'recording.webm', mimeType = 'audio/webm') {
    return _neonPost('proxyStt', {
        provider,
        base64: base64Audio,
        model,
        filename,
        mime_type: mimeType,
    });
}

async function neonValidateKey(provider) {
    return _neonPost('validateKey', { provider });
}

// base64 <-> Blob helpers (TTS returns base64 audio, STT sends base64 audio)
function base64ToBlob(base64, mimeType = 'audio/wav') {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mimeType });
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result;
            resolve(typeof dataUrl === 'string' ? (dataUrl.split(',')[1] || '') : '');
        };
        reader.onerror = () => reject(new Error('Gagal membaca audio sebagai base64.'));
        reader.readAsDataURL(blob);
    });
}

// =============================================
// API Keys (user_api_keys)
// =============================================

async function neonSaveKeys(groqKey, mistralKey) {
    try {
        await _neonPost('saveKeys', { groq_key: groqKey || '', mistral_key: mistralKey || '' });
        console.log(' API keys saved to Neon');
        return true;
    } catch (e) {
        console.warn(' Failed to save to Neon:', e.message);
        if (e.notAuth) throw e;
        const err = new Error(e.message || 'Gagal terhubung ke cloud storage');
        err.data = e.data;
        throw err;
    }
}

async function neonLoadKeys() {
    try {
        const data = await _neonPost('loadKeys');
        if (!data || data.error) return null;
        return { groq: data.groq || '', mistral: data.mistral || '' };
    } catch (e) {
        if (!e.notAuth) console.warn(' Failed to load from Neon:', e.message);
        return null;
    }
}

async function neonDeleteKeys() {
    try {
        await _neonPost('deleteKeys');
    } catch (e) {
        console.warn(' Failed to delete from Neon:', e.message);
    }
}

// =============================================
// Chat Sessions (chat_sessions)
// =============================================

async function neonSaveChatSession(session) {
    try {
        await _neonPost('saveChatSession', { session });
        return true;
    } catch (e) {
        console.warn(' Failed to save chat session to Neon:', e.message);
        return false;
    }
}

async function neonSaveAllChatSessions(sessions) {
    try {
        await _neonPost('saveAllChatSessions', { sessions });
        console.log(' All chat sessions saved to Neon');
        return true;
    } catch (e) {
        console.warn(' Failed to save all chat sessions:', e.message);
        return false;
    }
}

async function neonLoadChatSessions() {
    try {
        const data = await _neonPost('loadChatSessions');
        if (!Array.isArray(data)) return null;
        console.log(` Loaded ${data.length} chat sessions from Neon`);
        return data;
    } catch (e) {
        if (!e.notAuth) console.warn(' Failed to load chat sessions from Neon:', e.message);
        return null;
    }
}

async function neonDeleteChatSession(sessionId) {
    try {
        await _neonPost('deleteChatSession', { session_id: sessionId });
        console.log(' Chat session deleted from Neon:', sessionId);
        return true;
    } catch (e) {
        console.warn(' Failed to delete chat session from Neon:', e.message);
        return false;
    }
}

async function neonDeleteAllChatSessions() {
    try {
        await _neonPost('deleteAllChatSessions');
        console.log(' All chat sessions deleted from Neon');
        return true;
    } catch (e) {
        console.warn(' Failed to delete all chat sessions from Neon:', e.message);
        return false;
    }
}

// =============================================
// Speech History (TTS & STT) - speech_history
// =============================================

async function neonSaveSpeechRecord(record) {
    try {
        await _neonPost('saveSpeechRecord', { record });
        return true;
    } catch (e) {
        console.warn(' Failed to save speech record to Neon:', e.message);
        return false;
    }
}

async function neonLoadSpeechHistory() {
    try {
        const data = await _neonPost('loadSpeechHistory');
        if (!Array.isArray(data)) return null;
        const records = data.map(row => ({
            id: row.id,
            type: row.type,
            text: row.text,
            language: row.language,
            model: row.model,
            voice: row.voice,
            timestamp: row.timestamp,
            date: new Date(row.timestamp).toLocaleString('id-ID')
        }));
        console.log(` Loaded ${records.length} speech records from Neon`);
        return records;
    } catch (e) {
        if (!e.notAuth) console.warn(' Failed to load speech history from Neon:', e.message);
        return null;
    }
}

async function neonDeleteSpeechRecord(recordId) {
    try {
        await _neonPost('deleteSpeechRecord', { id: recordId });
        console.log(' Speech record deleted from Neon');
        return true;
    } catch (e) {
        console.warn(' Failed to delete speech record from Neon:', e.message);
        return false;
    }
}

async function neonDeleteSpeechRecordByTimestamp(timestamp, recordType) {
    try {
        await _neonPost('deleteSpeechRecordByTimestamp', { timestamp, record_type: recordType });
        console.log(' Speech record deleted from Neon by timestamp');
        return true;
    } catch (e) {
        console.warn(' Failed to delete speech record by timestamp:', e.message);
        return false;
    }
}

async function neonDeleteAllSpeechHistory() {
    try {
        await _neonPost('deleteAllSpeechHistory');
        console.log(' All speech history deleted from Neon');
        return true;
    } catch (e) {
        console.warn(' Failed to delete all speech history from Neon:', e.message);
        return false;
    }
}

// =============================================
// Daily Usage (daily_usage)
// =============================================

async function neonSaveDailyUsage(groqUsed, mistralUsed) {
    try {
        const today = new Date();
        const date = today.toISOString().split('T')[0];
        await _neonPost('saveDailyUsage', {
            groq_used: groqUsed || 0,
            mistral_used: mistralUsed || 0,
            date
        });
        console.log(' Daily usage saved to Neon');
        return true;
    } catch (e) {
        console.warn(' Failed to save daily usage to Neon:', e.message);
        return false;
    }
}

async function neonLoadDailyUsage(days = 30) {
    try {
        const data = await _neonPost('loadDailyUsage', { days });
        if (!Array.isArray(data)) return null;
        const records = data.map(row => ({
            date: row.date,
            groq_used: row.groq_used || 0,
            mistral_used: row.mistral_used || 0,
            groq_remaining: row.groq_remaining ?? (12000 - (row.groq_used || 0)),
            mistral_remaining: row.mistral_remaining ?? (12000 - (row.mistral_used || 0)),
            dateFormatted: new Date(row.date).toLocaleString('id-ID')
        }));
        console.log(` Loaded ${records.length} daily usage records from Neon`);
        return records;
    } catch (e) {
        if (!e.notAuth) console.warn(' Failed to load daily usage from Neon:', e.message);
        return null;
    }
}

async function neonDeleteDailyUsage(date) {
    try {
        await _neonPost('deleteDailyUsage', { date });
        console.log(' Daily usage deleted from Neon:', date);
        return true;
    } catch (e) {
        console.warn(' Failed to delete daily usage from Neon:', e.message);
        return false;
    }
}

// =============================================
// Voice Settings (voice_settings)
// =============================================

async function neonSaveVoiceSettings(ttsModel, sttModel, voiceAI, autoSpeak) {
    try {
        await _neonPost('saveVoiceSettings', {
            tts_model: ttsModel,
            stt_model: sttModel,
            voice_ai: voiceAI,
            auto_speak: autoSpeak === true || autoSpeak === 'true'
        });
        console.log(' Voice settings saved to Neon');
        return true;
    } catch (e) {
        console.warn(' Failed to save voice settings to Neon:', e.message);
        return false;
    }
}

async function neonLoadVoiceSettings() {
    try {
        const data = await _neonPost('loadVoiceSettings');
        if (!data) return null;
        console.log(' Voice settings loaded from Neon');
        return {
            ttsModel: data.ttsModel || 'canopylabs/orpheus-v1-english',
            sttModel: data.sttModel || 'whisper-large-v3-turbo',
            voiceAI: data.voiceAI || 'autumn',
            autoSpeak: data.autoSpeak === true || data.autoSpeak === 'true'
        };
    } catch (e) {
        if (!e.notAuth) console.warn(' Failed to load voice settings from Neon:', e.message);
        return null;
    }
}

// =============================================
// User Profile (profiles)
// =============================================

async function neonSaveProfile(profile) {
    try {
        await _neonPost('saveProfile', {
            name: profile.name || null,
            email: profile.email || null,
            phone: profile.phone || null,
            bio: profile.bio || null,
            picture: profile.picture || null,
            provider: profile.provider || 'email'
        });
        console.log(' Profile saved to Neon');
        return true;
    } catch (e) {
        console.warn(' Failed to save profile to Neon:', e.message);
        return false;
    }
}

async function neonLoadProfile() {
    try {
        const data = await _neonPost('loadProfile');
        if (!data) return null;
        console.log(' Profile loaded from Neon');
        return {
            name: data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            bio: data.bio || '',
            picture: data.picture || '',
            provider: data.provider || 'email',
            createdAt: data.createdAt || null
        };
    } catch (e) {
        if (!e.notAuth) console.warn(' Failed to load profile from Neon:', e.message);
        return null;
    }
}
