<?php
require_once dirname(__DIR__) . '/vendor/antecedent/patchwork/Patchwork.php';
require_once dirname(__DIR__) . '/vendor/autoload.php';

if (!defined('ABSPATH')) {
    define('ABSPATH', '/fake/wp/');
}
if (!defined('POSTPORTER_VERSION')) {
    define('POSTPORTER_VERSION', '1.0.0');
}
