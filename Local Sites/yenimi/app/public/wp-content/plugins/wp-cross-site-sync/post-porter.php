<?php
/**
 * Plugin Name: PostPorter
 * Plugin URI:  https://kraftysprouts.com/plugins/post-porter
 * Description: Copy, move, or sync WordPress posts to remote sites via the REST API.
 * Version:     1.0.0
 * Author:      Krafty Sprouts
 * Author URI:  https://kraftysprouts.com
 * Text Domain: post-porter
 * Domain Path: /languages
 * Requires at least: 6.0
 * Requires PHP:      8.0
 */

if (!defined('ABSPATH')) {
    exit;
}

define('POSTPORTER_VERSION',     '1.0.0');
define('POSTPORTER_PLUGIN_FILE', __FILE__);
define('POSTPORTER_PLUGIN_DIR',  plugin_dir_path(__FILE__));
define('POSTPORTER_PLUGIN_URL',  plugin_dir_url(__FILE__));

require_once POSTPORTER_PLUGIN_DIR . 'vendor/autoload.php';

add_action('plugins_loaded', function () {
    $loader = new PostPorter_Loader();
    $loader->init();
});

register_activation_hook(__FILE__,   ['PostPorter_Loader', 'activate']);
register_deactivation_hook(__FILE__, ['PostPorter_Loader', 'deactivate']);
