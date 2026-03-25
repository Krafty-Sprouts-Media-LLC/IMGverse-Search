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

// Load plugin classes for testing (mirrors what the loader does at runtime).
require_once dirname( __DIR__ ) . '/includes/class-postporter-crypto.php';
require_once dirname( __DIR__ ) . '/includes/class-postporter-settings.php';
