<?php
/**
 * PHPUnit bootstrap for PostPorter unit tests.
 *
 * @package PostPorter
 */

require_once dirname( __DIR__ ) . '/vendor/antecedent/patchwork/Patchwork.php';
require_once dirname( __DIR__ ) . '/vendor/autoload.php';

// WordPress stubs required by the classes under test.
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', '/fake/wp/' );
}
if ( ! defined( 'POSTPORTER_VERSION' ) ) {
	define( 'POSTPORTER_VERSION', '1.0.0' );
}
if ( ! defined( 'POSTPORTER_PLUGIN_DIR' ) ) {
	define( 'POSTPORTER_PLUGIN_DIR', dirname( __DIR__ ) . '/' );
}
if ( ! defined( 'POSTPORTER_PLUGIN_URL' ) ) {
	define( 'POSTPORTER_PLUGIN_URL', 'http://localhost/wp-content/plugins/post-porter/' );
}

// Minimal WP_Error stub for tests that instantiate it directly.
if ( ! class_exists( 'WP_Error' ) ) {
	/**
	 * Minimal WP_Error stub for unit tests.
	 *
	 * @package PostPorter
	 * @since   1.0.0
	 */
	class WP_Error {
		/**
		 * Error code.
		 *
		 * @since 1.0.0
		 * @var   string
		 */
		private string $code;

		/**
		 * Error message.
		 *
		 * @since 1.0.0
		 * @var   string
		 */
		private string $message;

		/**
		 * Constructor.
		 *
		 * @since 1.0.0
		 * @param string $code    Error code.
		 * @param string $message Error message.
		 */
		public function __construct( string $code = '', string $message = '' ) {
			$this->code    = $code;
			$this->message = $message;
		}

		/**
		 * Returns the error message.
		 *
		 * @since  1.0.0
		 * @return string Error message.
		 */
		public function get_error_message(): string {
			return $this->message;
		}

		/**
		 * Returns the error code.
		 *
		 * @since  1.0.0
		 * @return string Error code.
		 */
		public function get_error_code(): string {
			return $this->code;
		}
	}
}

// Load plugin classes for testing (mirrors what the loader does at runtime).
require_once dirname( __DIR__ ) . '/includes/class-postporter-crypto.php';
require_once dirname( __DIR__ ) . '/includes/class-postporter-settings.php';
require_once dirname( __DIR__ ) . '/includes/class-postporter-log.php';
require_once dirname( __DIR__ ) . '/includes/class-postporter-api.php';
require_once dirname( __DIR__ ) . '/includes/class-postporter-tax.php';
