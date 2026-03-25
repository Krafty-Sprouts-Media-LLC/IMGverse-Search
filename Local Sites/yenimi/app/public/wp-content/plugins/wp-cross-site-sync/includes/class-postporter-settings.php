<?php
/**
 * Remote site connection settings for PostPorter.
 *
 * Manages the list of remote WordPress sites that content can be sent
 * to. Credentials are encrypted before storage and decrypted on demand.
 * Global plugin defaults are also stored and retrieved here.
 *
 * @package PostPorter
 * @since   1.0.0
 */

declare( strict_types=1 );

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Manages remote site connections stored in wp_options.
 *
 * Each connection record contains a label, site URL, username, and an
 * AES-256-CBC encrypted application password. Passwords are never stored
 * or returned in plaintext except through get_plaintext_password().
 *
 * @package PostPorter
 * @since   1.0.0
 */
class PostPorter_Settings {

	/**
	 * Option key for the array of remote site connection records.
	 *
	 * @since 1.0.0
	 * @var   string
	 */
	const OPTION_KEY = 'postporter_connections';

	/**
	 * Option key for global plugin default settings.
	 *
	 * @since 1.0.0
	 * @var   string
	 */
	const DEFAULTS_KEY = 'postporter_defaults';

	// -------------------------------------------------------------------------
	// Connection CRUD
	// -------------------------------------------------------------------------

	/**
	 * Returns all registered remote site records.
	 *
	 * @since  1.0.0
	 * @return array<string, array> Associative array of site records keyed by site ID.
	 */
	public function get_sites(): array {
		return get_option( self::OPTION_KEY, array() );
	}

	/**
	 * Returns a single remote site record by ID.
	 *
	 * @since  1.0.0
	 * @param  string $id Site ID key.
	 * @return array|false Site record array, or false if not found.
	 */
	public function get_site( string $id ): array|false {
		$sites = $this->get_sites();
		return $sites[ $id ] ?? false;
	}

	/**
	 * Adds a new remote site connection and persists it.
	 *
	 * @since  1.0.0
	 * @param  array $data {
	 *     Connection data.
	 *     @type string $label    Human-readable site label.
	 *     @type string $url      Remote site URL.
	 *     @type string $username WordPress username on the remote site.
	 *     @type string $password Application password (plaintext — will be encrypted).
	 * }
	 * @return array The newly created site record (password is encrypted).
	 */
	public function add_site( array $data ): array {
		$sites        = $this->get_sites();
		$id           = uniqid( 'postporter_site_', true );
		$record       = $this->prepare_record( $id, $data );
		$sites[ $id ] = $record;
		update_option( self::OPTION_KEY, $sites );
		return $record;
	}

	/**
	 * Updates an existing remote site connection.
	 *
	 * If $data['password'] is empty, the existing encrypted password is
	 * preserved. Pass a new plaintext password to rotate credentials.
	 *
	 * @since  1.0.0
	 * @param  string $id   Site ID key.
	 * @param  array  $data New connection data (same shape as add_site).
	 * @return array|false  Updated site record, or false if ID not found.
	 */
	public function update_site( string $id, array $data ): array|false {
		$sites = $this->get_sites();

		if ( ! isset( $sites[ $id ] ) ) {
			return false;
		}

		$sites[ $id ] = $this->prepare_record( $id, $data, $sites[ $id ] );
		update_option( self::OPTION_KEY, $sites );
		return $sites[ $id ];
	}

	/**
	 * Removes a remote site connection.
	 *
	 * @since  1.0.0
	 * @param  string $id Site ID key.
	 * @return bool       True on success, false if the ID was not found.
	 */
	public function delete_site( string $id ): bool {
		$sites = $this->get_sites();

		if ( ! isset( $sites[ $id ] ) ) {
			return false;
		}

		unset( $sites[ $id ] );
		update_option( self::OPTION_KEY, $sites );
		return true;
	}

	/**
	 * Decrypts and returns the stored application password for a site.
	 *
	 * The password is decrypted on demand rather than stored in plaintext.
	 * Use this method when building an API client for a connection.
	 *
	 * @since  1.0.0
	 * @param  string $id Site ID key.
	 * @return string|false Decrypted plaintext password, or false if not found / decryption failed.
	 */
	public function get_plaintext_password( string $id ): string|false {
		$site = $this->get_site( $id );

		if ( false === $site ) {
			return false;
		}

		return PostPorter_Crypto::decrypt( $site['password'] );
	}

	// -------------------------------------------------------------------------
	// Defaults
	// -------------------------------------------------------------------------

	/**
	 * Returns global plugin default settings.
	 *
	 * Defaults are used as fallbacks when no per-action options are specified.
	 *
	 * @since  1.0.0
	 * @return array {
	 *     Default settings.
	 *     @type string   $remote_status  Post status to use on the remote site ('draft'|'publish').
	 *     @type bool     $preserve_date  Whether to preserve the original post date on transfer.
	 *     @type string[] $meta_whitelist Custom meta keys to include in transfers.
	 * }
	 */
	public function get_defaults(): array {
		return get_option(
			self::DEFAULTS_KEY,
			array(
				'remote_status'  => 'draft',
				'preserve_date'  => true,
				'meta_whitelist' => array(),
			)
		);
	}

	// -------------------------------------------------------------------------
	// Admin page registration
	// -------------------------------------------------------------------------

	/**
	 * Registers the PostPorter settings page under Settings.
	 *
	 * Hooked to admin_menu.
	 *
	 * @since  1.0.0
	 * @return void
	 */
	public function register_settings_page(): void {
		add_options_page(
			__( 'PostPorter', 'post-porter' ),
			__( 'PostPorter', 'post-porter' ),
			'manage_options',
			'postporter-settings',
			array( $this, 'render_settings_page' )
		);
	}

	/**
	 * Renders the PostPorter settings page.
	 *
	 * @since  1.0.0
	 * @return void
	 */
	public function render_settings_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have sufficient permissions to access this page.', 'post-porter' ) );
		}

		$sites    = $this->get_sites();
		$defaults = $this->get_defaults();
		require POSTPORTER_PLUGIN_DIR . 'admin/views/settings-page.php';
	}

	/**
	 * Registers the PostPorter sync log page under Tools.
	 *
	 * Hooked to admin_menu.
	 *
	 * @since  1.0.0
	 * @return void
	 */
	public function register_log_page(): void {
		add_management_page(
			__( 'PostPorter Sync Log', 'post-porter' ),
			__( 'PostPorter Log', 'post-porter' ),
			'manage_options',
			'postporter-sync-log',
			array( $this, 'render_log_page' )
		);
	}

	/**
	 * Renders the PostPorter sync log page.
	 *
	 * @since  1.0.0
	 * @return void
	 */
	public function render_log_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have sufficient permissions to access this page.', 'post-porter' ) );
		}

		$entries = PostPorter_Log::get_entries( 100 );
		require POSTPORTER_PLUGIN_DIR . 'admin/views/sync-log.php';
	}

	// -------------------------------------------------------------------------
	// Private helpers
	// -------------------------------------------------------------------------

	/**
	 * Sanitises input data and builds a site record array.
	 *
	 * If $data['password'] is empty, the password from $existing is kept
	 * as-is (already encrypted). A new password is only encrypted when
	 * explicitly provided, allowing label/URL updates without touching
	 * credentials.
	 *
	 * @since  1.0.0
	 * @param  string $id       Site ID key.
	 * @param  array  $data     New field values.
	 * @param  array  $existing Existing record to fall back to for omitted fields.
	 * @return array            Prepared record with encrypted password.
	 */
	private function prepare_record( string $id, array $data, array $existing = array() ): array {
		$password = $data['password'] ?? '';

		$encrypted_password = $password
			? PostPorter_Crypto::encrypt( $password )
			: ( $existing['password'] ?? '' );

		return array(
			'id'       => $id,
			'label'    => sanitize_text_field( $data['label']    ?? '' ),
			'url'      => esc_url_raw( $data['url']              ?? '' ),
			'username' => sanitize_text_field( $data['username'] ?? '' ),
			'password' => $encrypted_password,
		);
	}
}
