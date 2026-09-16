<?php
// Database helper for Neon PostgreSQL via PDO
require_once __DIR__ . '/config.php';

/**
 * Open (and reuse) a PDO connection to Neon.
 */
function neonConnect() {
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }
    $dsn = sprintf(
        "pgsql:host=%s;port=%s;dbname=%s;sslmode=%s;options='endpoint=%s'",
        NEON_HOST, NEON_PORT, NEON_DB, NEON_SSLMODE, NEON_ENDPOINT
    );
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];
    $pdo = new PDO($dsn, NEON_USER, NEON_PASS, $options);
    return $pdo;
}

/**
 * Read & decode the JSON request body once.
 */
function getJsonInput() {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/**
 * Send a JSON response and stop execution.
 */
function jsonResponse($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data);
    exit;
}

// =============================================
// CORS - hanya origin yang terdaftar di ALLOWED_ORIGINS
// =============================================
function sendCorsHeaders() {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? $_SERVER['HTTP_REFERER'] ?? '';
    // Ambil scheme+host saja dari referer (tanpa path) agar pencocokan akurat.
    if ($origin && (!in_array($origin, ALLOWED_ORIGINS, true))) {
        $parts = parse_url($origin);
        if (is_array($parts) && isset($parts['scheme'], $parts['host'])) {
            $candidate = $parts['scheme'] . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '');
            if (in_array($candidate, ALLOWED_ORIGINS, true)) {
                $origin = $candidate;
            } else {
                $origin = '';
            }
        } else {
            $origin = '';
        }
    }
    if ($origin !== '') {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
    }
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization');
    header('Access-Control-Expose-Headers: Content-Type');
}

// =============================================
// JWT (HS256) tanpa library eksternal
// =============================================
function b64urlEncode($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function b64urlDecode($data) {
    return base64_decode(strtr($data, '-_', '+/'), true);
}

function jwtCreate($payload, $ttlSeconds) {
    $header = ['alg' => 'HS256', 'typ' => 'JWT'];
    $now = time();
    $body = array_merge([
        'iat' => $now,
        'exp' => $now + $ttlSeconds,
        'jti' => bin2hex(random_bytes(8)),
    ], $payload);
    $seg1 = b64urlEncode(json_encode($header));
    $seg2 = b64urlEncode(json_encode($body));
    $sig  = hash_hmac('sha256', "$seg1.$seg2", JWT_SECRET, true);
    return "$seg1.$seg2." . b64urlEncode($sig);
}

/**
 * Verify a JWT. Returns payload array on success, null otherwise.
 */
function jwtVerify($token, &$payload = null) {
    if (!is_string($token) || $token === '') {
        return null;
    }
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return null;
    }
    [$seg1, $seg2, $sig] = $parts;
    $expected = b64urlEncode(hash_hmac('sha256', "$seg1.$seg2", JWT_SECRET, true));
    if (!hash_equals($expected, $sig)) {
        return null;
    }
    $payload = json_decode(b64urlDecode($seg2), true);
    if (!is_array($payload)) {
        return null;
    }
    if (isset($payload['exp']) && (int)$payload['exp'] < time()) {
        return null;
    }
    return $payload;
}

// =============================================
// Auth - baca & validasi JWT dari request
// =============================================
function bearerToken() {
    $auth = '';
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        if (isset($headers['Authorization'])) {
            $auth = $headers['Authorization'];
        }
    }
    if ($auth === '' && isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $auth = $_SERVER['HTTP_AUTHORIZATION'];
    }
    if ($auth === '' && isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $auth = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }
    if (preg_match('/Bearer\s+(\S+)/i', $auth, $m)) {
        return $m[1];
    }
    return '';
}

/**
 * Require a valid JWT. Returns the authenticated user email (lowercase)
 * or stops with 401/400.
 */
function requireAuth($input = []) {
    $token = bearerToken();
    // Fallback: izinkan token lewat body untuk alat/skenario tanpa header.
    if ($token === '' && isset($input['token'])) {
        $token = $input['token'];
    }
    if ($token === '') {
        jsonResponse(['error' => 'unauthorized', 'message' => 'Login diperlukan.'], 401);
    }
    $payload = null;
    if (!jwtVerify($token, $payload)) {
        jsonResponse(['error' => 'invalid_token', 'message' => 'Sesi tidak valid atau sudah kedaluwarsa.'], 401);
    }
    $email = strtolower(trim($payload['sub'] ?? ''));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['error' => 'invalid_user_email'], 400);
    }
    return $email;
}

/** Normalize a user row into the JSON shape returned to clients. */
function publicUser($row) {
    return [
        'email'    => $row['user_email'] ?? '',
        'name'     => $row['name'] ?? '',
        'picture'  => $row['picture'] ?? '',
        'provider' => $row['provider'] ?? 'email',
        'createdAt'=> $row['created_at'] ?? null,
    ];
}

// =============================================
// Google id_token verification (server side)
// =============================================
function verifyGoogleToken($credential) {
    if (!is_string($credential) || $credential === '') {
        return null;
    }
    $url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($credential);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code !== 200 || !$resp) {
        return null;
    }
    $info = json_decode($resp, true);
    if (!is_array($info)) {
        return null;
    }
    // Pastikan token dikeluarkan untuk aplikasi kita
    if (($info['aud'] ?? '') !== GOOGLE_CLIENT_ID) {
        return null;
    }
    if (empty($info['email']) || empty($info['email_verified'])) {
        return null;
    }
    if (isset($info['exp']) && (int)$info['exp'] < time()) {
        return null;
    }
    return $info;
}