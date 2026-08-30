-- =============================================
-- Neon PostgreSQL Migration - AI Assistant
-- Run this in Neon SQL Editor (console.neon.tech)
-- No RLS needed: access is via the PHP proxy in api.php,
-- which validates user_email on every request.
-- =============================================

-- 1. Chat Sessions table
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email TEXT NOT NULL,
    session_id TEXT NOT NULL,
    title TEXT DEFAULT 'Chat',
    messages JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_email, session_id)
);

-- 2. Speech History table (TTS & STT)
CREATE TABLE IF NOT EXISTS speech_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email TEXT NOT NULL,
    record_type TEXT NOT NULL CHECK (record_type IN ('TTS', 'STT')),
    text TEXT,
    language TEXT,
    model TEXT,
    voice TEXT,
    timestamp TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. User API Keys table
CREATE TABLE IF NOT EXISTS user_api_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email TEXT NOT NULL UNIQUE,
    groq_key TEXT DEFAULT '',
    mistral_key TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Daily Usage table (token tracking)
CREATE TABLE IF NOT EXISTS daily_usage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email TEXT NOT NULL,
    date DATE NOT NULL,
    groq_used INTEGER DEFAULT 0,
    mistral_used INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_email, date)
);

-- 5. Voice Settings table
CREATE TABLE IF NOT EXISTS voice_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_email TEXT NOT NULL UNIQUE,
    tts_model TEXT DEFAULT 'canopylabs/orpheus-v1-english',
    stt_model TEXT DEFAULT 'whisper-large-v3-turbo',
    voice_ai TEXT DEFAULT 'autumn',
    auto_speak BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_email);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_session_id ON chat_sessions(user_email, session_id);
CREATE INDEX IF NOT EXISTS idx_speech_history_user ON speech_history(user_email);
CREATE INDEX IF NOT EXISTS idx_speech_history_type ON speech_history(user_email, record_type);
CREATE INDEX IF NOT EXISTS idx_speech_history_timestamp ON speech_history(user_email, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_email ON user_api_keys(user_email);
CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date ON daily_usage(user_email, date DESC);
CREATE INDEX IF NOT EXISTS idx_voice_settings_email ON voice_settings(user_email);

-- 6. User Profiles table (cross-device profile sync)
CREATE TABLE IF NOT EXISTS profiles (
    user_email TEXT NOT NULL PRIMARY KEY,
    name TEXT,
    email TEXT,
    phone TEXT,
    bio TEXT,
    picture TEXT,
    provider TEXT DEFAULT 'email',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(user_email);
