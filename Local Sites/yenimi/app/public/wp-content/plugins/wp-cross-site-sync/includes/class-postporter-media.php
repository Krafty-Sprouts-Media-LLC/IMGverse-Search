<?php
/**
 * Featured image transfer for PostPorter.
 *
 * Reads the local featured image file and uploads it to the remote
 * site's media library via the REST API, returning the remote
 * attachment ID for use in the post payload.
 *
 * @package PostPorter
 * @since   1.0.0
 */

declare( strict_types=1 );

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Transfers the featured image of a local post to a remote WordPress site.
 *
 * Reads the local attachment file and uploads it via the REST API
 * media endpoint. Returns the remote attachment ID so that the caller
 * can set featured_media on the remote post.
 *
 * @package PostPorter
 * @since   1.0.0
 */
class PostPorter_Media {

	/**
	 * API transport instance for the remote site.
	 *
	 * @since 1.0.0
	 * @var   PostPorter_API
	 */
	private PostPorter_API $api;

	/**
	 * Constructor.
	 *
	 * @since 1.0.0
	 * @param PostPorter_API $api API transport instance for the remote site.
	 */
	public function __construct( PostPorter_API $api ) {
		$this->api = $api;
	}

	/**
	 * Uploads the featured image of a local post to the remote site.
	 *
	 * Returns false (does not throw) when the post has no featured image
	 * or the local file cannot be found, so the caller can continue the
	 * post transfer without a featured image rather than aborting.
	 *
	 * @since  1.0.0
	 * @param  int $post_id Local post ID.
	 * @return int|false    Remote attachment ID, or false if not applicable.
	 * @throws \RuntimeException If the upload to the remote site fails.
	 */
	public function transfer_featured_image( int $post_id ): int|false {
		$thumbnail_id = get_post_thumbnail_id( $post_id );

		if ( ! $thumbnail_id ) {
			return false;
		}

		$file_path = get_attached_file( $thumbnail_id );

		if ( ! $file_path || ! file_exists( $file_path ) ) {
			return false;
		}

		$filename  = basename( $file_path );
		$mime_type = mime_content_type( $file_path );

		if ( false === $mime_type ) {
			$mime_type = 'image/jpeg';
		}

		$response = $this->api->upload_media( $file_path, $filename, $mime_type );
		return (int) $response['id'];
	}
}
