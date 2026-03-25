<?php
/**
 * Post meta collection for PostPorter transfers.
 *
 * Collects SEO meta (Yoast SEO and RankMath) and admin-defined custom
 * meta keys from a local post so they can be sent to the remote site
 * as part of the post transfer payload.
 *
 * @package PostPorter
 * @since   1.0.0
 */

declare( strict_types=1 );

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Collects transferable post meta for a given post.
 *
 * Supports Yoast SEO, RankMath, and an admin-configured whitelist of
 * custom meta keys. Returns a flat key => value array ready for the
 * 'meta' field of the WP REST API post payload.
 *
 * @package PostPorter
 * @since   1.0.0
 */
class PostPorter_Meta {

	/**
	 * Yoast SEO meta keys to transfer when Yoast is active on both sites.
	 *
	 * @since 1.0.0
	 * @var   string[]
	 */
	private const YOAST_KEYS = array(
		'_yoast_wpseo_title',
		'_yoast_wpseo_metadesc',
		'_yoast_wpseo_focuskw',
	);

	/**
	 * RankMath SEO meta keys to transfer when RankMath is active on both sites.
	 *
	 * @since 1.0.0
	 * @var   string[]
	 */
	private const RANKMATH_KEYS = array(
		'rank_math_title',
		'rank_math_description',
		'rank_math_focus_keyword',
	);

	/**
	 * Active SEO plugin identifiers (e.g. ['yoast', 'rankmath']).
	 *
	 * @since 1.0.0
	 * @var   string[]
	 */
	private array $seo_plugins;

	/**
	 * Admin-defined meta key whitelist for custom meta transfer.
	 *
	 * @since 1.0.0
	 * @var   string[]
	 */
	private array $custom_keys;

	/**
	 * Constructor.
	 *
	 * @since 1.0.0
	 * @param string[] $seo_plugins Active SEO plugins: 'yoast' and/or 'rankmath'.
	 * @param string[] $custom_keys Admin-defined custom meta key whitelist.
	 */
	public function __construct( array $seo_plugins = array(), array $custom_keys = array() ) {
		$this->seo_plugins = $seo_plugins;
		$this->custom_keys = $custom_keys;
	}

	/**
	 * Collects all transferable meta values for a post.
	 *
	 * Only non-empty values are included. Keys with empty string values
	 * are silently omitted so the remote site can keep its own defaults.
	 *
	 * @since  1.0.0
	 * @param  int   $post_id Local post ID.
	 * @return array          Flat key => value array of meta to transfer.
	 */
	public function collect( int $post_id ): array {
		$meta = array();

		if ( in_array( 'yoast', $this->seo_plugins, true ) ) {
			foreach ( self::YOAST_KEYS as $key ) {
				$value = get_post_meta( $post_id, $key, true );
				if ( '' !== $value ) {
					$meta[ $key ] = $value;
				}
			}
		}

		if ( in_array( 'rankmath', $this->seo_plugins, true ) ) {
			foreach ( self::RANKMATH_KEYS as $key ) {
				$value = get_post_meta( $post_id, $key, true );
				if ( '' !== $value ) {
					$meta[ $key ] = $value;
				}
			}
		}

		foreach ( $this->custom_keys as $key ) {
			$value = get_post_meta( $post_id, sanitize_key( $key ), true );
			if ( '' !== $value ) {
				$meta[ $key ] = $value;
			}
		}

		return $meta;
	}
}
