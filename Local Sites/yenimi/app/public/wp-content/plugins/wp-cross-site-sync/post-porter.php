<?php
/**
 * PostPorter
 *
 * @package           PostPorter
 * @author            Krafty Sprouts
 * @copyright         2024 Krafty Sprouts
 * @license           GPL-2.0-or-later
 *
 * @wordpress-plugin
 * Plugin Name:       PostPorter
 * Plugin URI:        https://kraftysprouts.com/plugins/post-porter
 * Description:       Copy, move, or sync WordPress posts to remote sites via the REST API.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      8.0
 * Author:            Krafty Sprouts
 * Author URI:        https://kraftysprouts.com
 * Text Domain:       post-porter
 * Domain Path:       /languages
 * License:           GPL v2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.txt
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'POSTPORTER_VERSION',     '1.0.0' );
define( 'POSTPORTER_PLUGIN_FILE', __FILE__ );
define( 'POSTPORTER_PLUGIN_DIR',  plugin_dir_path( __FILE__ ) );
define( 'POSTPORTER_PLUGIN_URL',  plugin_dir_url( __FILE__ ) );

require_once POSTPORTER_PLUGIN_DIR . 'includes/class-postporter-loader.php';

/**
 * Bootstraps the plugin after all plugins are loaded.
 *
 * @since 1.0.0
 */
add_action(
	'plugins_loaded',
	function () {
		$loader = new PostPorter_Loader();
		$loader->init();
	}
);

register_activation_hook( __FILE__,   array( 'PostPorter_Loader', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'PostPorter_Loader', 'deactivate' ) );
