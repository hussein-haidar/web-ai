<?php
// Neon API router - handles all database operations for the AI Assistant.
require_once __DIR__ . '/db.php';

// Allow requests from the same origin (XAMPP). Adjust if hosted elsewhere.
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'method_not_allowed'], 405);
}

$input = getJsonInput();
$action = $input['action'] ?? '';

// Wrap all DB work in try/catch so connection & SQL errors return clean JSON
// instead of a raw PHP 500 that the browser can't parse as JSON.
try {
    $pdo = neonConnect();

switch ($action) {

    // ---------- user_api_keys ----------
    case 'saveKeys':
        $email  = requireUserEmail($input);
        $groq   = $input['groq_key']   ?? '';
        $mistral = $input['mistral_key'] ?? '';
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

    case 'loadKeys':
        $email = requireUserEmail($input);
        $stmt = $pdo->prepare("SELECT groq_key, mistral_key FROM user_api_keys WHERE user_email = ?");
        $stmt->execute([$email]);
        $row = $stmt->fetch() ?: null;
        if ($row === null) {
            jsonResponse(['groq' => '', 'mistral' => '']);
        }
        jsonResponse(['groq' => $row['groq_key'] ?? '', 'mistral' => $row['mistral_key'] ?? '']);
        break;

    case 'deleteKeys':
        $email = requireUserEmail($input);
        $pdo->prepare("DELETE FROM user_api_keys WHERE user_email = ?")->execute([$email]);
        jsonResponse(['success' => true]);
        break;

    // ---------- chat_sessions ----------
    case 'saveChatSession':
        $email   = requireUserEmail($input);
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
        $email    = requireUserEmail($input);
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
        $email = requireUserEmail($input);
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
        $email = requireUserEmail($input);
        $sid   = $input['session_id'] ?? '';
        $pdo->prepare("DELETE FROM chat_sessions WHERE user_email = ? AND session_id = ?")
            ->execute([$email, $sid]);
        jsonResponse(['success' => true]);
        break;

    case 'deleteAllChatSessions':
        $email = requireUserEmail($input);
        $pdo->prepare("DELETE FROM chat_sessions WHERE user_email = ?")->execute([$email]);
        jsonResponse(['success' => true]);
        break;

    // ---------- speech_history ----------
    case 'saveSpeechRecord':
        $email = requireUserEmail($input);
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
        $email = requireUserEmail($input);
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
        $email = requireUserEmail($input);
        $id    = $input['id'] ?? '';
        $pdo->prepare("DELETE FROM speech_history WHERE user_email = ? AND id = ?")
            ->execute([$email, $id]);
        jsonResponse(['success' => true]);
        break;

    case 'deleteSpeechRecordByTimestamp':
        $email = requireUserEmail($input);
        $ts    = $input['timestamp'] ?? '';
        $type  = $input['record_type'] ?? '';
        $pdo->prepare("
            DELETE FROM speech_history
            WHERE user_email = ? AND timestamp = ?::timestamptz AND record_type = ?
        ")->execute([$email, $ts, $type]);
        jsonResponse(['success' => true]);
        break;

    case 'deleteAllSpeechHistory':
        $email = requireUserEmail($input);
        $pdo->prepare("DELETE FROM speech_history WHERE user_email = ?")->execute([$email]);
        jsonResponse(['success' => true]);
        break;

    // ---------- daily_usage ----------
    case 'saveDailyUsage':
        $email   = requireUserEmail($input);
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
        $email = requireUserEmail($input);
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
        $email = requireUserEmail($input);
        $date  = $input['date'] ?? '';
        $pdo->prepare("DELETE FROM daily_usage WHERE user_email = ? AND date = ?")
            ->execute([$email, $date]);
        jsonResponse(['success' => true]);
        break;

    // ---------- voice_settings ----------
    case 'saveVoiceSettings':
        $email   = requireUserEmail($input);
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
        $email = requireUserEmail($input);
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
        $email  = requireUserEmail($input);
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
        $email = requireUserEmail($input);
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

    default:
        jsonResponse(['error' => 'unknown_action'], 400);
        break;
}

} catch (Throwable $e) {
    // Log the real error server-side, but never leak DB details to the client.
    error_log('Neon API error (' . ($action ?? 'unknown') . '): ' . $e->getMessage());
    jsonResponse(['error' => 'database_error', 'message' => $e->getMessage()], 500);
}
