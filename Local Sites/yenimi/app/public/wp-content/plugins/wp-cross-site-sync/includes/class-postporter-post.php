<?php
/**
 * Post transfer orchestration for PostPorter.
 *
 * Coordinates the copy, move, and sync actions by building the REST API
 * payload from a local post and dispatching it to the remote site via
 * the API transport. Stores and manages the sync relationship in post meta.
 *
 * @package PostPorter
 * @since   1.0.0
 */

declare( strict_types=1 );

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Orchestrates post transfers (copy / move / sync) to a remote WordPress site.
 *
 * SYNC LOOP PREVENTION: The static $is_syncing flag is set to true before
 * a programmatic post update and reset in a finally block. This prevents
 * the save_post hook (PostPorter_Sync_Hook) from firing recursively.
 *
 * @package PostPorter
 * @since   1.0.0
 */
class PostPorter_Post {

	/**
	 * Prevents save_post re-entrancy during programmatic sync updates.
	 *
	 * @since 1.0.0
	 * @var   bool
	 */
	private static bool $is_syncing = false;

	/**
	 * API transport instance for the remote site.
	 *
	 * @since 1.0.0
	 * @var   PostPorter_API
	 */
	private PostPorter_API $api;

	/**
	 * Taxonomy resolver for the remote site.
	 *
	 * @since 1.0.0
	 * @var   PostPorter_Tax
	 */
	private PostPorter_Tax $tax;

	/**
	 * Media transfer handler for the remote site.
	 *
	 * @since 1.0.0
	 * @var   PostPorter_Media
	 */
	private PostPorter_Media $media;

	/**
	 * Meta collector for the source post.
	 *
	 * @since 1.0.0
	 * @var   PostPorter_Meta
	 */
	private PostPorter_Meta $meta;

	/**
	 * Constructor.
	 *
	 * @since 1.0.0
	 * @param PostPorter_API   $api   API transport.
	 * @param PostPorter_Tax   $tax   Taxonomy resolver.
	 * @param PostPorter_Media $media Featured image transfer handler.
	 * @param PostPorter_Meta  $meta  Meta collector.
	 */
	public function __construct(
		PostPorter_API $api,
		PostPorter_Tax $tax,
		PostPorter_Media $media,
		PostPorter_Meta $meta
	) {
		$this->api   = $api;
		$this->tax   = $tax;
		$this->media = $media;
		$this->meta  = $meta;
	}

	// -------------------------------------------------------------------------
	// Transfer actions
	// -------------------------------------------------------------------------

	/**
	 * Copies the post to the remote site without modifying the source post.
	 *
	 * @since  1.0.0
	 * @param  int    $post_id  Local post ID.
	 * @param  string $site_id  Remote site ID key (used for logging by caller).
	 * @param  array  $options {
	 *     Optional transfer options.
	 *     @type string $remote_status Post status on the remote site ('draft'|'publish'). Default 'draft'.
	 *     @type bool   $preserve_date Whether to preserve the original post date. Default true.
	 * }
	 * @return int   Remote post ID.
	 * @throws \RuntimeException On API failure.
	 */
	public function copy( int $post_id, string $site_id, array $options = array() ): int {
		$payload = $this->build_payload(
			$post_id,
			$options['remote_status'] ?? 'draft',
			$options['preserve_date'] ?? true
		);
		$remote = $this->api->post( 'posts', $payload );
		return (int) $remote['id'];
	}

	/**
	 * Copies the post to the remote site, then trashes it locally on success.
	 *
	 * A confirmation dialog is shown by the JS modal before this action is
	 * triggered; no additional confirmation is performed server-side.
	 *
	 * @since  1.0.0
	 * @param  int    $post_id  Local post ID.
	 * @param  string $site_id  Remote site ID key.
	 * @param  array  $options  Same shape as copy().
	 * @return int              Remote post ID.
	 * @throws \RuntimeException On API failure (source post is NOT trashed on failure).
	 */
	public function move( int $post_id, string $site_id, array $options = array() ): int {
		$remote_id = $this->copy( $post_id, $site_id, $options );
		wp_trash_post( $post_id );
		return $remote_id;
	}

	/**
	 * Creates or updates the remote post and stores the sync relationship.
	 *
	 * If a sync relationship already exists and the remote post has been
	 * deleted (HTTP 404), a new remote post is created and the stored
	 * remote post ID is updated automatically.
	 *
	 * @since  1.0.0
	 * @param  int    $post_id  Local post ID.
	 * @param  string $site_id  Remote site ID key.
	 * @param  array  $options  Same shape as copy().
	 * @return int              Remote post ID.
	 * @throws \RuntimeException On API failure (non-404 errors are re-thrown).
	 */
	public function sync( int $post_id, string $site_id, array $options = array() ): int {
		$existing_remote_id = (int) get_post_meta( $post_id, '_postporter_sync_remote_post_id', true );
		$payload            = $this->build_payload(
			$post_id,
			$options['remote_status'] ?? 'publish',
			$options['preserve_date'] ?? true
		);

		if ( $existing_remote_id ) {
			try {
				$remote    = $this->api->put( "posts/{$existing_remote_id}", $payload );
				$remote_id = (int) $remote['id'];
			} catch ( \RuntimeException $e ) {
				if ( 404 === $e->getCode() ) {
					// Remote post was deleted — create a fresh one.
					$remote    = $this->api->post( 'posts', $payload );
					$remote_id = (int) $remote['id'];
				} else {
					throw $e;
				}
			}
		} else {
			$remote    = $this->api->post( 'posts', $payload );
			$remote_id = (int) $remote['id'];
		}

		update_post_meta( $post_id, '_postporter_sync_remote_site',    $site_id );
		update_post_meta( $post_id, '_postporter_sync_remote_post_id', $remote_id );
		update_post_meta( $post_id, '_postporter_sync_last_synced',    current_time( 'mysql' ) );

		return $remote_id;
	}

	/**
	 * Removes the sync relationship meta from a post.
	 *
	 * Does not delete the remote post. The remote post continues to exist
	 * independently after the sync relationship is broken.
	 *
	 * @since  1.0.0
	 * @param  int  $post_id Local post ID.
	 * @return void
	 */
	public function break_sync( int $post_id ): void {
		delete_post_meta( $post_id, '_postporter_sync_remote_site' );
		delete_post_meta( $post_id, '_postporter_sync_remote_post_id' );
		delete_post_meta( $post_id, '_postporter_sync_last_synced' );
	}

	// -------------------------------------------------------------------------
	// Sync loop prevention
	// -------------------------------------------------------------------------

	/**
	 * Returns true when a sync operation is in progress.
	 *
	 * Used by PostPorter_Sync_Hook to skip the save_post handler during
	 * programmatic post updates triggered by a sync, preventing infinite loops.
	 *
	 * @since  1.0.0
	 * @return bool
	 */
	public static function is_syncing(): bool {
		return self::$is_syncing;
	}

	/**
	 * Sets the in-progress sync flag.
	 *
	 * Should be called with true immediately before a sync operation and
	 * reset to false in a finally block.
	 *
	 * @since  1.0.0
	 * @param  bool $state New flag state.
	 * @return void
	 */
	public static function set_syncing( bool $state ): void {
		self::$is_syncing = $state;
	}

	// -------------------------------------------------------------------------
	// Payload builder
	// -------------------------------------------------------------------------

	/**
	 * Builds the REST API POST payload for a local post.
	 *
	 * Collects core fields, taxonomies, featured image, and meta, and
	 * returns them as an array ready for wp/v2/posts (POST or PUT).
	 *
	 * @since  1.0.0
	 * @param  int    $post_id       Local post ID.
	 * @param  string $remote_status Post status to use on the remote site.
	 * @param  bool   $preserve_date Whether to include the original post_date.
	 * @return array                 REST API payload array.
	 * @throws \RuntimeException     Propagated from taxonomy or media transfer.
	 */
	public function build_payload( int $post_id, string $remote_status, bool $preserve_date ): array {
		$post = get_post( $post_id );

		$payload = array(
			'title'   => $post->post_title,
			'content' => $post->post_content,
			'excerpt' => $post->post_excerpt,
			'status'  => $remote_status,
		);

		if ( $preserve_date ) {
			$payload['date'] = $post->post_date;
		}

		$categories = get_the_terms( $post_id, 'category' );
		$tags       = get_the_terms( $post_id, 'post_tag' );

		if ( is_array( $categories ) && $categories ) {
			$payload['categories'] = $this->tax->resolve_terms( 'categories', $categories );
		}

		if ( is_array( $tags ) && $tags ) {
			$payload['tags'] = $this->tax->resolve_terms( 'tags', $tags );
		}

		$remote_thumb = $this->media->transfer_featured_image( $post_id );
		if ( false !== $remote_thumb ) {
			$payload['featured_media'] = $remote_thumb;
		}

		$meta = $this->meta->collect( $post_id );
		if ( $meta ) {
			$payload['meta'] = $meta;
		}

		return $payload;
	}
}
