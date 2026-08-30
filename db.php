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
 * Validate and return the user_email from the request.
 * Terminates the script with an error response if missing/invalid.
 */
function requireUserEmail(array $input) {
    $email = $input['user_email'] ?? '';
    if (!is_string($email) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['error' => 'invalid_user_email'], 400);
    }
    return $email;
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
