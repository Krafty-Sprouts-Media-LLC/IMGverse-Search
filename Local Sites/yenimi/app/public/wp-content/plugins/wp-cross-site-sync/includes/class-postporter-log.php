<?php
/**
 * Sync log table management for PostPorter.
 *
 * Creates and manages the database table that records every copy, move,
 * and sync action. The table is capped at 500 entries; older entries are
 * pruned automatically on each insert.
 *
 * @package PostPorter
 * @since   1.0.0
 */

declare( strict_types=1 );

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Manages the PostPorter sync log database table.
 *
 * Separates build_entry() (pure validation/transformation, fully unit-testable)
 * from insert() (writes to the database, requires a live WordPress environment).
 *
 * @package PostPorter
 * @since   1.0.0
 */
class PostPorter_Log {

	/**
	 * Suffix appended to $wpdb->prefix to form the full table name.
	 *
	 * @since 1.0.0
	 * @var   string
	 */
	const TABLE_SUFFIX = 'postporter_sync_log';

	/**
	 * Maximum number of log entries to retain.
	 *
	 * Older entries are pruned after each insert once this limit is exceeded.
	 *
	 * @since 1.0.0
	 * @var   int
	 */
	const MAX_ENTRIES = 500;

	/**
	 * Allowed values for the action column.
	 *
	 * @since 1.0.0
	 * @var   string[]
	 */
	const VALID_ACTIONS = array( 'copy', 'move', 'sync' );

	/**
	 * Allowed values for the status column.
	 *
	 * @since 1.0.0
	 * @var   string[]
	 */
	const VALID_STATUSES = array( 'success', 'failed' );

	/**
	 * Returns the fully-qualified log table name including the WP table prefix.
	 *
	 * @since  1.0.0
	 * @global \wpdb $wpdb WordPress database abstraction object.
	 * @return string Full table name, e.g. wp_postporter_sync_log.
	 */
	public static function get_table_name(): string {
		global $wpdb;
		return $wpdb->prefix . self::TABLE_SUFFIX;
	}

	/**
	 * Creates the sync log table on plugin activation.
	 *
	 * Uses dbDelta() so the table is only created (never dropped) and can
	 * be safely called on every activation without data loss.
	 *
	 * @since  1.0.0
	 * @global \wpdb $wpdb WordPress database abstraction object.
	 * @return void
	 */
	public static function create_table(): void {
		global $wpdb;

		$table   = self::get_table_name();
		$charset = $wpdb->get_charset_collate();

		$sql = "CREATE TABLE IF NOT EXISTS {$table} (
			id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			post_id     BIGINT UNSIGNED NOT NULL,
			post_title  VARCHAR(255)    NOT NULL DEFAULT '',
			site_id     VARCHAR(100)    NOT NULL,
			site_label  VARCHAR(100)    NOT NULL DEFAULT '',
			action      VARCHAR(10)     NOT NULL,
			status      VARCHAR(10)     NOT NULL,
			message     TEXT            NOT NULL DEFAULT '',
			created_at  DATETIME        NOT NULL,
			PRIMARY KEY (id)
		) {$charset};";

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		dbDelta( $sql );
	}

	/**
	 * Validates input and builds a log entry array without writing to the database.
	 *
	 * Separating validation from persistence allows this method to be unit-tested
	 * without a database connection. insert() calls this method internally.
	 *
	 * @since  1.0.0
	 * @param  array $data {
	 *     Log entry data.
	 *     @type int    $post_id    Local post ID.
	 *     @type string $post_title Post title at time of action.
	 *     @type string $site_id    Remote site ID key.
	 *     @type string $site_label Remote site human-readable label.
	 *     @type string $action     One of 'copy', 'move', 'sync'.
	 *     @type string $status     One of 'success', 'failed'.
	 *     @type string $message    Optional error message.
	 * }
	 * @return array Sanitised entry array ready for $wpdb->insert().
	 * @throws \InvalidArgumentException If action or status is not a recognised value.
	 */
	public static function build_entry( array $data ): array {
		$required = array( 'post_id', 'site_id', 'action', 'status' );
		foreach ( $required as $key ) {
			if ( ! array_key_exists( $key, $data ) ) {
				throw new \InvalidArgumentException(
					sprintf( 'PostPorter_Log: required field "%s" is missing.', $key )
				);
			}
		}

		if ( ! in_array( $data['action'], self::VALID_ACTIONS, true ) ) {
			throw new \InvalidArgumentException(
				sprintf( 'PostPorter_Log: invalid action "%s".', $data['action'] )
			);
		}

		if ( ! in_array( $data['status'], self::VALID_STATUSES, true ) ) {
			throw new \InvalidArgumentException(
				sprintf( 'PostPorter_Log: invalid status "%s".', $data['status'] )
			);
		}

		return array(
			'post_id'    => (int) $data['post_id'],
			'post_title' => sanitize_text_field( $data['post_title'] ?? '' ),
			'site_id'    => sanitize_key( $data['site_id'] ?? '' ),
			'site_label' => sanitize_text_field( $data['site_label'] ?? '' ),
			'action'     => $data['action'],
			'status'     => $data['status'],
			'message'    => wp_kses_post( $data['message'] ?? '' ),
			'created_at' => current_time( 'mysql' ),
		);
	}

	/**
	 * Inserts a log entry and prunes old entries if the cap is exceeded.
	 *
	 * @since  1.0.0
	 * @param  array $data Log entry data (same shape as build_entry()).
	 * @global \wpdb $wpdb WordPress database abstraction object.
	 * @return bool        True on success, false on database error.
	 * @throws \InvalidArgumentException Propagated from build_entry() on invalid action/status.
	 */
	public static function insert( array $data ): bool {
		global $wpdb;

		$entry  = self::build_entry( $data );
		$result = $wpdb->insert( self::get_table_name(), $entry );

		if ( $result ) {
			self::prune();
		}

		return (bool) $result;
	}

	/**
	 * Returns the most recent log entries.
	 *
	 * @since  1.0.0
	 * @param  int $limit  Maximum number of rows to return. Default 100.
	 * @param  int $offset Number of rows to skip for pagination. Default 0.
	 * @global \wpdb $wpdb WordPress database abstraction object.
	 * @return array[]     Array of associative row arrays, newest first.
	 */
	public static function get_entries( int $limit = 100, int $offset = 0 ): array {
		global $wpdb;

		$table = esc_sql( self::get_table_name() );

		return $wpdb->get_results(
			$wpdb->prepare(
				// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is safe.
				"SELECT * FROM `{$table}` ORDER BY id DESC LIMIT %d OFFSET %d",
				$limit,
				$offset
			),
			ARRAY_A
		) ?: array();
	}

	/**
	 * Deletes the oldest entries when MAX_ENTRIES is exceeded.
	 *
	 * @since  1.0.0
	 * @global \wpdb $wpdb WordPress database abstraction object.
	 * @return void
	 */
	private static function prune(): void {
		global $wpdb;

		$table = esc_sql( self::get_table_name() );
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is derived from wpdb->prefix + constant, safe.
		$count = (int) $wpdb->get_var( "SELECT COUNT(*) FROM `{$table}`" );

		if ( $count > self::MAX_ENTRIES ) {
			$wpdb->query(
				$wpdb->prepare(
					// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name is safe.
					"DELETE FROM `{$table}` ORDER BY id ASC LIMIT %d",
					$count - self::MAX_ENTRIES
				)
			);
		}
	}
}
