<?php
/**
 * Encryption utility for PostPorter credential storage.
 *
 * Provides reversible AES-256-CBC encryption for application passwords
 * stored in wp_options. The encryption key is derived from the site's
 * AUTH_KEY constant so that credentials are installation-specific.
 *
 * @package PostPorter
 * @since   1.0.0
 */

declare( strict_types=1 );

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Handles reversible encryption and decryption of stored credentials.
 *
 * Uses AES-256-CBC with a random 16-byte IV per encryption. The IV is
 * prepended to the ciphertext before base64 encoding so it can be
 * recovered during decryption without separate storage.
 *
 * @package PostPorter
 * @since   1.0.0
 */
class PostPorter_Crypto {

	/**
	 * Derives a 32-byte encryption key from the WordPress AUTH_KEY option.
	 *
	 * The key is derived via SHA-256 so it is always exactly 32 bytes
	 * regardless of the length or content of AUTH_KEY.
	 *
	 * @since  1.0.0
	 * @return string 32-byte binary key.
	 */
	private static function get_key(): string {
		$raw = get_option( 'auth_key', 'fallback-insecure-key' );
		return substr( hash( 'sha256', $raw, true ), 0, 32 );
	}

	/**
	 * Encrypts a plaintext string using AES-256-CBC.
	 *
	 * A cryptographically random 16-byte IV is generated for each call,
	 * prepended to the ciphertext, and the result is base64-encoded for
	 * safe storage in wp_options.
	 *
	 * @since  1.0.0
	 * @param  string $plaintext The string to encrypt.
	 * @return string            Base64-encoded IV + ciphertext.
	 * @throws \RuntimeException If OpenSSL encryption fails.
	 */
	public static function encrypt( string $plaintext ): string {
		$iv         = random_bytes( 16 );
		$ciphertext = openssl_encrypt(
			$plaintext,
			'AES-256-CBC',
			self::get_key(),
			OPENSSL_RAW_DATA,
			$iv
		);

		if ( false === $ciphertext ) {
			throw new \RuntimeException( 'PostPorter_Crypto: openssl_encrypt failed.' );
		}

		return base64_encode( $iv . $ciphertext );
	}

	/**
	 * Decrypts a base64-encoded payload produced by encrypt().
	 *
	 * Returns false rather than throwing for malformed input so that
	 * callers can handle corrupt stored data gracefully without try/catch.
	 *
	 * @since  1.0.0
	 * @param  string $payload Base64-encoded IV + ciphertext.
	 * @return string|false    Decrypted plaintext, or false on failure.
	 */
	public static function decrypt( string $payload ): string|false {
		$decoded = base64_decode( $payload, true );

		if ( false === $decoded || strlen( $decoded ) < 17 ) {
			return false;
		}

		$iv         = substr( $decoded, 0, 16 );
		$ciphertext = substr( $decoded, 16 );

		return openssl_decrypt(
			$ciphertext,
			'AES-256-CBC',
			self::get_key(),
			OPENSSL_RAW_DATA,
			$iv
		);
	}
}
