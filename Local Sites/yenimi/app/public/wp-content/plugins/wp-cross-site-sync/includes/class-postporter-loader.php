<?php
/**
 * Plugin loader — bootstraps all PostPorter components.
 *
 * Loads every class file via require_once so no Composer autoloader
 * is needed at runtime. This makes the plugin safe to install on any
 * standard WordPress installation without additional setup.
 *
 * @package PostPorter
 * @since   1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// Load all plugin classes.
require_once POSTPORTER_PLUGIN_DIR . 'includes/class-postporter-crypto.php';
require_once POSTPORTER_PLUGIN_DIR . 'includes/class-postporter-settings.php';
require_once POSTPORTER_PLUGIN_DIR . 'includes/class-postporter-log.php';
require_once POSTPORTER_PLUGIN_DIR . 'includes/class-postporter-api.php';
require_once POSTPORTER_PLUGIN_DIR . 'includes/class-postporter-tax.php';
require_once POSTPORTER_PLUGIN_DIR . 'includes/class-postporter-media.php';
require_once POSTPORTER_PLUGIN_DIR . 'includes/class-postporter-meta.php';

/**
 * Boots all PostPorter components and registers WordPress hooks.
 *
 * @package PostPorter
 * @since   1.0.0
 */
class PostPorter_Loader {

	/**
	 * Initialises all plugin components and registers hooks.
	 *
	 * Called on the plugins_loaded action. Instantiates every component
	 * and wires up its WordPress hooks.
	 *
	 * @since 1.0.0
	 * @return void
	 */
	public function init(): void {
		// Components wired up in later tasks.
	}

	/**
	 * Runs on plugin activation.
	 *
	 * Creates the sync log database table.
	 *
	 * @since 1.0.0
	 * @return void
	 */
	public static function activate(): void {
		if ( class_exists( 'PostPorter_Log' ) ) {
			PostPorter_Log::create_table();
		}
	}

	/**
	 * Runs on plugin deactivation.
	 *
	 * @since 1.0.0
	 * @return void
	 */
	public static function deactivate(): void {
		// Reserved for future cleanup.
	}
}
