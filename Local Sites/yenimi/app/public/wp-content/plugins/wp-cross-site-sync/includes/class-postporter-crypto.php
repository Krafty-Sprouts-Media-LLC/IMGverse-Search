<?php
/**
 * Reversible AES-256-CBC encryption for stored app passwords.
 * Key is derived from WordPress AUTH_KEY so it is installation-specific.
 */
class PostPorter_Crypto {

    private static function get_key(): string {
        $raw = get_option('auth_key', 'fallback-insecure-key');
        return substr(hash('sha256', $raw, true), 0, 32);
    }

    public static function encrypt(string $plaintext): string {
        $iv         = random_bytes(16);
        $ciphertext = openssl_encrypt(
            $plaintext, 'AES-256-CBC', self::get_key(), OPENSSL_RAW_DATA, $iv
        );
        return base64_encode($iv . $ciphertext);
    }

    public static function decrypt(string $payload): string|false {
        $decoded = base64_decode($payload, strict: true);
        if ($decoded === false || strlen($decoded) < 17) {
            return false;
        }
        $iv         = substr($decoded, 0, 16);
        $ciphertext = substr($decoded, 16);
        return openssl_decrypt(
            $ciphertext, 'AES-256-CBC', self::get_key(), OPENSSL_RAW_DATA, $iv
        );
    }
}
