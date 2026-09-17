<?php
// Neon API router - handles all database operations for the AI Assistant.
// Auth: semua action data membutuhkan JWT (Authorization: Bearer <token>).
// Pre-auth actions: register, login, googleLogin.
require_once __DIR__ . '/db.php';

sendCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'method_not_allowed'], 405);
}

$input = getJsonInput();
$action = $input['action'] ?? '';

// ------------------------------------------------------------------
// Helpers provider (Groq & Mistral) yang dipanggil SERVER-SIDE.
// API key user tidak pernah dikirim ke browser; disimpan di DB.
// ------------------------------------------------------------------
function loadStoredKeys($pdo, $email) {
    $stmt = $pdo->prepare('SELECT groq_key, mistral_key FROM user_api_keys WHERE user_email = ?');
    $stmt->execute([$email]);
    $row = $stmt->fetch();
    return [
        'groq'    => trim($row['groq_key']   ?? ''),
        'mistral' => trim($row['mistral_key'] ?? ''),
    ];
}

function providerKeyAndUrl($provider) {
    if ($provider === 'groq') {
        return [
            'chat'  => 'https://api.groq.com/openai/v1/chat/completions',
            'tts'   => 'https://api.groq.com/openai/v1/audio/speech',
            'stt'   => 'https://api.groq.com/openai/v1/audio/transcriptions',
            'models'=> 'https://api.groq.com/openai/v1/models',
        ];
    }
    return [
        'chat'  => 'https://api.mistral.ai/v1/chat/completions',
        'tts'   => 'https://api.mistral.ai/v1/tts',
        'stt'   => 'https://api.mistral.ai/v1/audio/transcriptions',
        'models'=> 'https://api.mistral.ai/v1/models',
    ];
}

function providerResult($status, $raw) {
    $json = json_decode($raw, true);
    return [
        'ok'     => $status >= 200 && $status < 300,
        'status' => (int)$status,
        'data'   => is_array($json) ? $json : (string)$raw,
    ];
}

/** JSON POST ke provider dengan API key milik user (server-side). */
function httpJsonRequest($url, $bodyArray, $apiKey, $timeout = 90) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($bodyArray),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $apiKey,
        ],
    ]);
    $raw = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return providerResult($status, $raw);
}

/** Multipart POST (digunakan untuk STT: audio + model). */
function httpMultipartRequest($url, $fileField, $fields, $fileData, $filename, $mime, $apiKey, $timeout = 90) {
    $boundary = '----WebAi' . bin2hex(random_bytes(8));
    $body = '';
    foreach ($fields as $k => $v) {
        $body .= "--$boundary\r\nContent-Disposition: form-data; name=\"$k\"\r\n\r\n$v\r\n";
    }
    $body .= "--$boundary\r\nContent-Disposition: form-data; name=\"$fileField\"; filename=\"$filename\"\r\n";
    $body .= "Content-Type: $mime\r\n\r\n";
    $body .= $fileData;
    $body .= "\r\n--$boundary--\r\n";

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: multipart/form-data; boundary=' . $boundary,
            'Authorization: Bearer ' . $apiKey,
        ],
    ]);
    $raw = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return providerResult($status, $raw);
}

/** GET ke provider (mis. daftar model untuk validasi key). */
function httpGetRequest($url, $apiKey, $timeout = 30) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_HTTPHEADER     => ['Authorization: Bearer ' . $apiKey],
    ]);
    $raw = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return providerResult($status, $raw);
}

// Wrap all DB work in try/catch so connection & SQL errors return clean JSON
// instead of a raw PHP 500 that the browser can't parse as JSON.
try {
    $pdo = neonConnect();

switch ($action) {

    // ==================== AUTH (tanpa JWT) ====================
    case 'register': {
        $name     = trim($input['name'] ?? '');
        $email    = strtolower(trim($input['email'] ?? ''));
        $password = (string)($input['password'] ?? '');
        $remember = !empty($input['remember']);

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            jsonResponse(['error' => 'invalid_email', 'message' => 'Email tidak valid.'], 400);
        }
        if (strlen($password) < 6) {
            jsonResponse(['error' => 'password_too_short', 'message' => 'Password minimal 6 karakter.'], 400);
        }
        $stmt = $pdo->prepare('SELECT 1 FROM users WHERE user_email = ?');
        $stmt->execute([$email]);
        if ($stmt->fetch()) {
            jsonResponse(['error' => 'email_taken', 'message' => 'Email sudah terdaftar.'], 409);
        }
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $pdo->prepare("INSERT INTO users (user_email, name, password_hash, provider)
                       VALUES (?, ?, ?, 'email')")
            ->execute([$email, $name === '' ? $email : $name, $hash]);

        $stmt = $pdo->prepare('SELECT user_email, name, picture, provider, created_at FROM users WHERE user_email = ?');
        $stmt->execute([$email]);
        $row = $stmt->fetch();
        $token = jwtCreate(['sub' => $email], $remember ? JWT_TTL_REMEMBER : JWT_TTL_DEFAULT);
        jsonResponse(['success' => true, 'token' => $token, 'user' => publicUser($row)]);
        break;
    }

    case 'login': {
        $email    = strtolower(trim($input['email'] ?? ''));
        $password = (string)($input['password'] ?? '');
        $remember = !empty($input['remember']);

        $stmt = $pdo->prepare('SELECT * FROM users WHERE user_email = ?');
        $stmt->execute([$email]);
        $row = $stmt->fetch();

        // Jangan bocorkan apakah email terdaftar: pesan sama untuk kedua kasus.
        if (!$row || empty($row['password_hash']) || !password_verify($password, $row['password_hash'])) {
            jsonResponse(['error' => 'invalid_credentials', 'message' => 'Email atau password salah.'], 401);
        }
        // Rehash bila algoritma default berubah (defense against old hashes)
        if (password_needs_rehash($row['password_hash'], PASSWORD_DEFAULT)) {
            $pdo->prepare('UPDATE users SET password_hash = ?, updated_at = now() WHERE user_email = ?')
                ->execute([password_hash($password, PASSWORD_DEFAULT), $email]);
        }
        $token = jwtCreate(['sub' => $email], $remember ? JWT_TTL_REMEMBER : JWT_TTL_DEFAULT);
        jsonResponse(['success' => true, 'token' => $token, 'user' => publicUser($row)]);
        break;
    }

    case 'googleLogin': {
        $info = verifyGoogleToken($input['credential'] ?? '');
        if ($info === null) {
            jsonResponse(['error' => 'invalid_google_token', 'message' => 'Verifikasi token Google gagal.'], 401);
        }
        $email = strtolower($info['email']);
        $sub   = (string)($info['sub'] ?? '');
        $name  = (string)($info['name'] ?? '');
        $picture = (string)($info['picture'] ?? '');

        // 1) cari via google_sub, 2) via email, lalu link / buat.
        $stmt = $pdo->prepare("SELECT * FROM users WHERE google_sub = ? OR user_email = ? ORDER BY user_email LIMIT 1");
        $stmt->execute([$sub, $email]);
        $row = $stmt->fetch();

        if ($row) {
            $pdo->prepare("UPDATE users SET name = COALESCE(NULLIF(?, ''), name),
                            picture = COALESCE(NULLIF(?, ''), picture),
                            google_sub = COALESCE(google_sub, ?), provider = 'google',
                            updated_at = now() WHERE user_email = ?")
                ->execute([$name, $picture, $sub, $row['user_email']]);
            $email = $row['user_email'];
        } else {
            $pdo->prepare("INSERT INTO users (user_email, name, password_hash, provider, google_sub, picture)
                           VALUES (?, ?, NULL, 'google', ?, ?)")
                ->execute([$email, $name === '' ? $email : $name, $sub, $picture]);
        }

        $stmt = $pdo->prepare('SELECT user_email, name, picture, provider, created_at FROM users WHERE user_email = ?');
        $stmt->execute([$email]);
        $row = $stmt->fetch();
        $token = jwtCreate(['sub' => $email], JWT_TTL_REMEMBER);
        jsonResponse(['success' => true, 'token' => $token, 'user' => publicUser($row)]);
        break;
    }

    // ==================== AUTH (butuh JWT) ====================
    case 'authCheck': {
        $email = requireAuth($input);
        $stmt = $pdo->prepare('SELECT user_email, name, picture, provider, created_at FROM users WHERE user_email = ?');
        $stmt->execute([$email]);
        $row = $stmt->fetch() ?: null;
        if ($row === null) {
            jsonResponse(['error' => 'user_not_found'], 404);
        }
        jsonResponse(['user' => publicUser($row)]);
        break;
    }

    case 'changePassword': {
        $email   = requireAuth($input);
        $current = (string)($input['current_password'] ?? '');
        $new     = (string)($input['new_password'] ?? '');
        if (strlen($new) < 6) {
            jsonResponse(['error' => 'password_too_short', 'message' => 'Password baru minimal 6 karakter.'], 400);
        }
        $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE user_email = ?');
        $stmt->execute([$email]);
        $row = $stmt->fetch() ?: null;
        if ($row === null || empty($row['password_hash'])) {
            jsonResponse(['error' => 'google_account', 'message' => 'Akun Google tidak memakai password.'], 400);
        }
        if (!password_verify($current, $row['password_hash'])) {
            jsonResponse(['error' => 'wrong_password', 'message' => 'Password saat ini salah.'], 401);
        }
        $pdo->prepare('UPDATE users SET password_hash = ?, updated_at = now() WHERE user_email = ?')
            ->execute([password_hash($new, PASSWORD_DEFAULT), $email]);
        jsonResponse(['success' => true]);
        break;
    }

    // ------------------ Proxy Groq / Mistral (server-side) ------------------
    case 'proxyChat': {
        $email   = requireAuth($input);
        $provider = strtolower($input['provider'] ?? '');
        if (!in_array($provider, ['groq', 'mistral'], true)) {
            jsonResponse(['error' => 'invalid_provider'], 400);
        }
        $keys = loadStoredKeys($pdo, $email);
        $apiKey = $keys[$provider];
        if ($apiKey === '') {
            jsonResponse(['ok' => false, 'status' => 401,
                'error' => ['error' => ['message' => "API key $provider belum dikonfigurasi."]]], 401);
        }
        $urls = providerKeyAndUrl($provider);
        $body = [
            'model'       => $input['model'] ?? '',
            'messages'    => $input['messages'] ?? [],
            'max_tokens'  => isset($input['max_tokens']) ? (int)$input['max_tokens'] : 1024,
            'temperature' => isset($input['temperature']) ? (float)$input['temperature'] : 0.7,
        ];
        $res = httpJsonRequest($urls['chat'], $body, $apiKey);
        jsonResponse($res, $res['ok'] ? 200 : 502);
        break;
    }

    case 'proxyTts': {
        $email    = requireAuth($input);
        $provider = strtolower($input['provider'] ?? 'groq');
        if (!in_array($provider, ['groq', 'mistral'], true)) {
            jsonResponse(['error' => 'invalid_provider'], 400);
        }
        $keys = loadStoredKeys($pdo, $email);
        $apiKey = $keys[$provider];
        if ($apiKey === '') {
            jsonResponse(['ok' => false, 'status' => 401,
                'error' => ['error' => ['message' => "API key $provider belum dikonfigurasi."]]], 401);
        }
        $urls = providerKeyAndUrl($provider);
        $text = (string)($input['input'] ?? $input['text'] ?? '');
        if ($text === '') {
            jsonResponse(['ok' => false, 'status' => 400, 'error' => ['message' => 'Teks kosong.']], 400);
        }
        if ($provider === 'groq') {
            $payload = [
                'model'           => $input['model'] ?? 'canopylabs/orpheus-v1-english',
                'input'           => $text,
                'voice'           => $input['voice'] ?? 'autumn',
                'response_format' => $input['response_format'] ?? 'wav',
            ];
            $mime = $input['response_format'] === 'mp3' ? 'audio/mpeg' : 'audio/wav';
        } else {
            $payload = [
                'model' => $input['model'] ?? 'tts-1',
                'text'  => $text,
                'voice' => $input['voice'] ?? 'alloy',
            ];
            $mime = 'audio/mpeg';
        }

        $ch = curl_init($urls['tts']);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($payload),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 90,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $apiKey,
            ],
        ]);
        $raw = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($status >= 200 && $status < 300 && $raw !== false) {
            jsonResponse(['ok' => true, 'status' => $status, 'base64' => base64_encode($raw), 'mimeType' => $mime]);
        } else {
            $json = json_decode((string)$raw, true);
            jsonResponse(['ok' => false, 'status' => (int)$status,
                'error' => is_array($json) ? $json : (string)$raw], 502);
        }
        break;
    }

    case 'proxyStt': {
        $email    = requireAuth($input);
        $provider = strtolower($input['provider'] ?? 'groq');
        if (!in_array($provider, ['groq', 'mistral'], true)) {
            jsonResponse(['error' => 'invalid_provider'], 400);
        }
        $keys = loadStoredKeys($pdo, $email);
        $apiKey = $keys[$provider];
        if ($apiKey === '') {
            jsonResponse(['ok' => false, 'status' => 401,
                'error' => ['error' => ['message' => "API key $provider belum dikonfigurasi."]]], 401);
        }
        $audio = base64_decode((string)($input['base64'] ?? ''), true);
        if ($audio === false || $audio === '') {
            jsonResponse(['ok' => false, 'status' => 400, 'error' => ['message' => 'Tidak ada audio yang valid.']], 400);
        }
        $urls = providerKeyAndUrl($provider);
        $model = $input['model'] ?? ($provider === 'groq' ? 'whisper-large-v3-turbo' : 'voxtral-mini-latest');
        $filename = $input['filename'] ?? 'recording.webm';
        $mime = $input['mime_type'] ?? 'audio/webm';
        $fields = ['model' => $model, 'response_format' => 'json'];
        $res = httpMultipartRequest($urls['stt'], 'file', $fields, $audio, $filename, $mime, $apiKey);
        jsonResponse($res, $res['ok'] ? 200 : 502);
        break;
    }

    case 'validateKey': {
        $email    = requireAuth($input);
        $provider = strtolower($input['provider'] ?? '');
        if (!in_array($provider, ['groq', 'mistral'], true)) {
            jsonResponse(['error' => 'invalid_provider'], 400);
        }
        $keys = loadStoredKeys($pdo, $email);
        $apiKey = $keys[$provider];
        if ($apiKey === '') {
            jsonResponse(['ok' => false, 'status' => 401, 'data' => null], 401);
        }
        $urls = providerKeyAndUrl($provider);
        $res = httpGetRequest($urls['models'], $apiKey);
        jsonResponse(['ok' => $res['ok'], 'status' => $res['status'], 'data' => $res['data']], $res['ok'] ? 200 : 502);
        break;
    }

    // ---------- user_api_keys ----------
    case 'saveKeys': {
        $email  = requireAuth($input);
        $groq   = trim((string)($input['groq_key']   ?? ''));
        $mistral = trim((string)($input['mistral_key'] ?? ''));
        $pdo->prepare("
            INSERT INTO user_api_keys (user_email, groq_key, mistral_key, updated_at)
            VALUES (?, ?, ?, now())
            ON CONFLICT (user_email) DO UPDATE
              SET groq_key = EXCLUDED.groq_key,
                  mistral_key = EXCLUDED.mistral_key,
                  updated_at = now()
        ")->execute([$email, $groq, $mistral]);
        jsonResponse(['success' => true]);
        break;
    }

    case 'loadKeys': {
        $email = requireAuth($input);
        $stmt = $pdo->prepare("SELECT groq_key, mistral_key FROM user_api_keys WHERE user_email = ?");
        $stmt->execute([$email]);
        $row = $stmt->fetch() ?: null;
        // Key TIDAK dikirim ke browser; hanya status ketersediaan.
        jsonResponse([
            'groq'    => !!($row['groq_key']    ?? ''),
            'mistral' => !!($row['mistral_key'] ?? ''),
        ]);
        break;
    }

    case 'deleteKeys': {
        $email = requireAuth($input);
        $pdo->prepare("DELETE FROM user_api_keys WHERE user_email = ?")->execute([$email]);
        jsonResponse(['success' => true]);
        break;
    }

    // ---------- chat_sessions ----------
    case 'saveChatSession':
        $email   = requireAuth($input);
        $s       = $input['session'] ?? [];
        $sid     = $s['id'] ?? '';
        $title   = $s['title'] ?? 'Chat';
        $msgs    = json_encode($s['messages'] ?? []);
        $created = $s['createdAt'] ?? null;
        $pdo->prepare("
            INSERT INTO chat_sessions (user_email, session_id, title, messages, created_at, updated_at)
            VALUES (?, ?, ?, ?::jsonb, COALESCE(?::timestamptz, now()), now())
            ON CONFLICT (user_email, session_id) DO UPDATE
              SET title = EXCLUDED.title,
                  messages = EXCLUDED.messages,
                  updated_at = now()
        ")->execute([$email, $sid, $title, $msgs, $created]);
        jsonResponse(['success' => true]);
        break;

    case 'saveAllChatSessions':
        $email    = requireAuth($input);
        $sessions = $input['sessions'] ?? [];
        $stmt = $pdo->prepare("
            INSERT INTO chat_sessions (user_email, session_id, title, messages, created_at, updated_at)
            VALUES (?, ?, ?, ?::jsonb, COALESCE(?::timestamptz, now()), now())
            ON CONFLICT (user_email, session_id) DO UPDATE
              SET title = EXCLUDED.title,
                  messages = EXCLUDED.messages,
                  updated_at = now()
        ");
        foreach ($sessions as $s) {
            $stmt->execute([
                $email,
                $s['id'] ?? '',
                $s['title'] ?? 'Chat',
                json_encode($s['messages'] ?? []),
                $s['createdAt'] ?? null,
            ]);
        }
        jsonResponse(['success' => true]);
        break;

    case 'loadChatSessions':
        $email = requireAuth($input);
        $stmt = $pdo->prepare("
            SELECT session_id, title, messages, created_at, updated_at
            FROM chat_sessions WHERE user_email = ? ORDER BY created_at DESC
        ");
        $stmt->execute([$email]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $out = array_map(function ($r) {
            return [
                'id'         => $r['session_id'],
                'title'      => $r['title'],
                'messages'   => json_decode($r['messages'], true) ?? [],
                'createdAt'  => $r['created_at'],
                'updatedAt'  => $r['updated_at'],
            ];
        }, $rows);
        jsonResponse($out);
        break;

    case 'deleteChatSession':
        $email = requireAuth($input);
        $sid   = $input['session_id'] ?? '';
        $pdo->prepare("DELETE FROM chat_sessions WHERE user_email = ? AND session_id = ?")
            ->execute([$email, $sid]);
        jsonResponse(['success' => true]);
        break;

    case 'deleteAllChatSessions':
        $email = requireAuth($input);
        $pdo->prepare("DELETE FROM chat_sessions WHERE user_email = ?")->execute([$email]);
        jsonResponse(['success' => true]);
        break;

    // ---------- speech_history ----------
    case 'saveSpeechRecord':
        $email = requireAuth($input);
        $r     = $input['record'] ?? [];
        $pdo->prepare("
            INSERT INTO speech_history (user_email, record_type, text, language, model, voice, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, COALESCE(?::timestamptz, now()))
        ")->execute([
            $email,
            $r['type'] ?? 'TTS',
            $r['text'] ?? null,
            $r['language'] ?? null,
            $r['model'] ?? null,
            $r['voice'] ?? null,
            $r['timestamp'] ?? null,
        ]);
        jsonResponse(['success' => true]);
        break;

    case 'loadSpeechHistory':
        $email = requireAuth($input);
        $stmt = $pdo->prepare("
            SELECT id, record_type, text, language, model, voice, timestamp
            FROM speech_history WHERE user_email = ? ORDER BY timestamp DESC LIMIT 50
        ");
        $stmt->execute([$email]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $out = array_map(function ($r) {
            return [
                'id'        => $r['id'],
                'type'      => $r['record_type'],
                'text'      => $r['text'],
                'language'  => $r['language'],
                'model'     => $r['model'],
                'voice'     => $r['voice'],
                'timestamp' => $r['timestamp'],
            ];
        }, $rows);
        jsonResponse($out);
        break;

    case 'deleteSpeechRecord':
        $email = requireAuth($input);
        $id    = $input['id'] ?? '';
        $pdo->prepare("DELETE FROM speech_history WHERE user_email = ? AND id = ?")
            ->execute([$email, $id]);
        jsonResponse(['success' => true]);
        break;

    case 'deleteSpeechRecordByTimestamp':
        $email = requireAuth($input);
        $ts    = $input['timestamp'] ?? '';
        $type  = $input['record_type'] ?? '';
        $pdo->prepare("
            DELETE FROM speech_history
            WHERE user_email = ? AND timestamp = ?::timestamptz AND record_type = ?
        ")->execute([$email, $ts, $type]);
        jsonResponse(['success' => true]);
        break;

    case 'deleteAllSpeechHistory':
        $email = requireAuth($input);
        $pdo->prepare("DELETE FROM speech_history WHERE user_email = ?")->execute([$email]);
        jsonResponse(['success' => true]);
        break;

    // ---------- daily_usage ----------
    case 'saveDailyUsage':
        $email   = requireAuth($input);
        $groq    = (int)($input['groq_used'] ?? 0);
        $mistral = (int)($input['mistral_used'] ?? 0);
        $date    = $input['date'] ?? date('Y-m-d');
        $pdo->prepare("
            INSERT INTO daily_usage (user_email, date, groq_used, mistral_used, updated_at)
            VALUES (?, ?, ?, ?, now())
            ON CONFLICT (user_email, date) DO UPDATE
              SET groq_used = EXCLUDED.groq_used,
                  mistral_used = EXCLUDED.mistral_used,
                  updated_at = now()
        ")->execute([$email, $date, $groq, $mistral]);
        jsonResponse(['success' => true]);
        break;

    case 'loadDailyUsage':
        $email = requireAuth($input);
        $days  = (int)($input['days'] ?? 30);
        $end   = date('Y-m-d');
        $start = date('Y-m-d', strtotime("-{$days} days"));
        $stmt = $pdo->prepare("
            SELECT date, groq_used, mistral_used
            FROM daily_usage
            WHERE user_email = ? AND date >= ? AND date <= ? ORDER BY date DESC
        ");
        $stmt->execute([$email, $start, $end]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $out = array_map(function ($r) {
            $g = (int)$r['groq_used'];
            $m = (int)$r['mistral_used'];
            return [
                'date'              => $r['date'],
                'groq_used'         => $g,
                'mistral_used'      => $m,
                'groq_remaining'    => 12000 - $g,
                'mistral_remaining' => 12000 - $m,
                'dateFormatted'     => $r['date'],
            ];
        }, $rows);
        jsonResponse($out);
        break;

    case 'deleteDailyUsage':
        $email = requireAuth($input);
        $date  = $input['date'] ?? '';
        $pdo->prepare("DELETE FROM daily_usage WHERE user_email = ? AND date = ?")
            ->execute([$email, $date]);
        jsonResponse(['success' => true]);
        break;

    // ---------- voice_settings ----------
    case 'saveVoiceSettings':
        $email   = requireAuth($input);
        $tts     = $input['tts_model']  ?? 'canopylabs/orpheus-v1-english';
        $stt     = $input['stt_model']  ?? 'whisper-large-v3-turbo';
        $voice   = $input['voice_ai']   ?? 'autumn';
        $auto    = !empty($input['auto_speak']) ? true : false;
        $pdo->prepare("
            INSERT INTO voice_settings (user_email, tts_model, stt_model, voice_ai, auto_speak, updated_at)
            VALUES (?, ?, ?, ?, ?, now())
            ON CONFLICT (user_email) DO UPDATE
              SET tts_model = EXCLUDED.tts_model,
                  stt_model = EXCLUDED.stt_model,
                  voice_ai  = EXCLUDED.voice_ai,
                  auto_speak = EXCLUDED.auto_speak,
                  updated_at = now()
        ")->execute([$email, $tts, $stt, $voice, $auto]);
        jsonResponse(['success' => true]);
        break;

    case 'loadVoiceSettings':
        $email = requireAuth($input);
        $stmt = $pdo->prepare("
            SELECT tts_model, stt_model, voice_ai, auto_speak
            FROM voice_settings WHERE user_email = ?
        ");
        $stmt->execute([$email]);
        $row = $stmt->fetch() ?: null;
        if ($row === null) {
            jsonResponse(null);
        }
        $auto = $row['auto_speak'];
        jsonResponse([
            'ttsModel'  => $row['tts_model'],
            'sttModel'  => $row['stt_model'],
            'voiceAI'   => $row['voice_ai'],
            'autoSpeak' => ($auto === true || $auto === 't' || $auto === '1' || $auto === 1),
        ]);
        break;

    // ---------- profiles ----------
    case 'saveProfile':
        $email  = requireAuth($input);
        $name   = $input['name']   ?? null;
        $pemail = $input['email']  ?? null;
        $phone  = $input['phone']  ?? null;
        $bio    = $input['bio']    ?? null;
        $picture = $input['picture'] ?? null;
        $provider = $input['provider'] ?? 'email';
        $pdo->prepare("
            INSERT INTO profiles (user_email, name, email, phone, bio, picture, provider, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, now())
            ON CONFLICT (user_email) DO UPDATE SET
                name = EXCLUDED.name,
                email = EXCLUDED.email,
                phone = EXCLUDED.phone,
                bio = EXCLUDED.bio,
                picture = EXCLUDED.picture,
                provider = EXCLUDED.provider,
                updated_at = now()
        ")->execute([$email, $name, $pemail, $phone, $bio, $picture, $provider]);
        jsonResponse(['success' => true]);
        break;

    case 'loadProfile':
        $email = requireAuth($input);
        $stmt = $pdo->prepare("
            SELECT name, email, phone, bio, picture, provider, created_at
            FROM profiles WHERE user_email = ?
        ");
        $stmt->execute([$email]);
        $row = $stmt->fetch() ?: null;
        if ($row === null) {
            jsonResponse(null);
        }
        jsonResponse([
            'name'      => $row['name'],
            'email'     => $row['email'],
            'phone'     => $row['phone'],
            'bio'       => $row['bio'],
            'picture'   => $row['picture'],
            'provider'  => $row['provider'],
            'createdAt' => $row['created_at'],
        ]);
        break;

    // ---------- notes ----------
    case 'saveAllNotes':
        $email = requireAuth($input);
        $notes = $input['notes'] ?? [];
        if (!is_array($notes)) {
            jsonResponse(['error' => 'invalid_notes'], 400);
        }
        $stmt = $pdo->prepare("
            INSERT INTO notes (user_email, note_id, title, content, category, color, pinned, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?::timestamptz, now()), now())
            ON CONFLICT (user_email, note_id) DO UPDATE
              SET title = EXCLUDED.title,
                  content = EXCLUDED.content,
                  category = EXCLUDED.category,
                  color = EXCLUDED.color,
                  pinned = EXCLUDED.pinned,
                  updated_at = now()
        ");
        $pdo->beginTransaction();
        try {
            foreach ($notes as $n) {
                if (!is_array($n) || empty($n['id'])) continue;
                $stmt->execute([
                    $email,
                    (string)$n['id'],
                    $n['title'] ?? null,
                    $n['content'] ?? '',
                    $n['category'] ?? 'Umum',
                    $n['color'] ?? '',
                    !empty($n['pinned']) ? true : false,
                    $n['createdAt'] ?? null,
                ]);
            }
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        jsonResponse(['success' => true]);
        break;

    case 'loadNotes':
        $email = requireAuth($input);
        $stmt = $pdo->prepare("
            SELECT note_id, title, content, category, color, pinned, created_at, updated_at
            FROM notes WHERE user_email = ? ORDER BY pinned DESC, updated_at DESC
        ");
        $stmt->execute([$email]);
        $rows = $stmt->fetchAll();
        jsonResponse(array_map(function ($r) {
            $pin = $r['pinned'];
            return [
                'id'        => $r['note_id'],
                'title'     => $r['title'],
                'content'   => $r['content'],
                'category'  => $r['category'],
                'color'     => $r['color'],
                'pinned'    => ($pin === true || $pin === 't' || $pin === '1' || $pin === 1),
                'createdAt' => $r['created_at'],
                'updatedAt' => $r['updated_at'],
            ];
        }, $rows));
        break;

    case 'deleteNote':
        $email = requireAuth($input);
        $pdo->prepare("DELETE FROM notes WHERE user_email = ? AND note_id = ?")
            ->execute([$email, $input['note_id'] ?? '']);
        jsonResponse(['success' => true]);
        break;

    case 'deleteAllNotes':
        $email = requireAuth($input);
        $pdo->prepare("DELETE FROM notes WHERE user_email = ?")
            ->execute([$email]);
        jsonResponse(['success' => true]);
        break;

    default:
        jsonResponse(['error' => 'unknown_action'], 400);
        break;
}

} catch (Throwable $e) {
    // Log the real error server-side, but never leak DB details to the client.
    error_log('Neon API error (' . ($action ?? 'unknown') . '): ' . $e->getMessage());
    jsonResponse(['error' => 'database_error', 'message' => 'Terjadi kesalahan server.'], 500);
}