<?php
/**
 * Taxonomy (category and tag) sync for PostPorter.
 *
 * Resolves or creates categories and tags on a remote WordPress site,
 * matching by slug first then by name. Creates the term remotely if
 * neither match is found.
 *
 * @package PostPorter
 * @since   1.0.0
 */

declare( strict_types=1 );

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Resolves taxonomy terms on the remote site, creating them if necessary.
 *
 * Used by PostPorter_Post to ensure categories and tags exist on the
 * destination site before attaching them to a transferred post.
 *
 * @package PostPorter
 * @since   1.0.0
 */
class PostPorter_Tax {

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
	 * Returns the remote term ID, creating the term if it does not exist.
	 *
	 * Lookup order:
	 * 1. Match by slug (exact).
	 * 2. Match by name (case-insensitive) — handles slug divergence.
	 * 3. Create the term on the remote site.
	 *
	 * @since  1.0.0
	 * @param  string $endpoint REST API endpoint: 'categories' or 'tags'.
	 * @param  string $name     Term display name.
	 * @param  string $slug     Term slug.
	 * @return int              Remote term ID.
	 * @throws \RuntimeException If the API request or term creation fails.
	 */
	public function resolve_term( string $endpoint, string $name, string $slug ): int {
		// 1. Match by slug.
		$results = $this->api->get( $endpoint, array( 'slug' => $slug ) );
		foreach ( $results as $term ) {
			if ( $term['slug'] === $slug ) {
				return (int) $term['id'];
			}
		}

		// 2. Match by name (handles cases where slug differs from name).
		$search = $this->api->get( $endpoint, array( 'search' => $name, 'per_page' => 10 ) );
		foreach ( $search as $term ) {
			if ( strtolower( $term['name'] ) === strtolower( $name ) ) {
				return (int) $term['id'];
			}
		}

		// 3. Create it on the remote site.
		$new = $this->api->post( $endpoint, array( 'name' => $name, 'slug' => $slug ) );
		return (int) $new['id'];
	}

	/**
	 * Resolves multiple taxonomy terms and returns an array of remote IDs.
	 *
	 * @since  1.0.0
	 * @param  string     $endpoint REST API endpoint: 'categories' or 'tags'.
	 * @param  \WP_Term[] $terms    Array of local WP_Term objects.
	 * @return int[]                Array of remote term IDs.
	 * @throws \RuntimeException    Propagated from resolve_term() on API failure.
	 */
	public function resolve_terms( string $endpoint, array $terms ): array {
		$ids = array();
		foreach ( $terms as $term ) {
			$ids[] = $this->resolve_term( $endpoint, $term->name, $term->slug );
		}
		return $ids;
	}
}
