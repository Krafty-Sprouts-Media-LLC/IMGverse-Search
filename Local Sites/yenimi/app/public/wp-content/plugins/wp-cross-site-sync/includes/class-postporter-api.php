<?php
/**
 * REST API HTTP transport for PostPorter.
 *
 * Provides a thin wrapper around WordPress HTTP API functions for
 * communicating with the WP REST API v2 on remote sites. Uses
 * Application Password Basic Auth. All HTTP calls go through
 * wp_remote_*() — no direct cURL.
 *
 * @package PostPorter
 * @since   1.0.0
 */

declare( strict_types=1 );

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Low-level HTTP transport for WP REST API v2.
 *
 * One instance per remote site connection. Immutable after construction.
 * Throws \RuntimeException on any non-2xx response or WP_Error so that
 * callers can use a single try/catch without inspecting response arrays.
 *
 * @package PostPorter
 * @since   1.0.0
 */
class PostPorter_API {

	/**
	 * Remote site base URL (e.g. https://example.com).
	 *
	 * @since 1.0.0
	 * @var   string
	 */
	private string $base_url;

	/**
	 * WordPress username on the remote site.
	 *
	 * @since 1.0.0
	 * @var   string
	 */
	private string $username;

	/**
	 * Application password (plaintext) for the remote site.
	 *
	 * @since 1.0.0
	 * @var   string
	 */
	private string $password;

	/**
	 * HTTP request timeout in seconds.
	 *
	 * @since 1.0.0
	 * @var   int
	 */
	private int $timeout;

	/**
	 * Constructor.
	 *
	 * @since 1.0.0
	 * @param string $base_url Remote site base URL.
	 * @param string $username WordPress username on the remote site.
	 * @param string $password Application password (plaintext).
	 * @param int    $timeout  HTTP timeout in seconds. Default 30.
	 */
	public function __construct(
		string $base_url,
		string $username,
		string $password,
		int $timeout = 30
	) {
		$this->base_url = $base_url;
		$this->username = $username;
		$this->password = $password;
		$this->timeout  = $timeout;
	}

	/**
	 * Returns the HTTP Basic Auth header value for this connection.
	 *
	 * The format is "Basic <base64(username:password)>" as required by
	 * WordPress Application Passwords (RFC 7617).
	 *
	 * @since  1.0.0
	 * @return string Authorization header value.
	 */
	public function get_auth_header(): string {
		return 'Basic ' . base64_encode( $this->username . ':' . $this->password );
	}

	/**
	 * Tests connectivity to the remote site's REST API root.
	 *
	 * Performs a lightweight GET to /wp-json/ and returns true only when
	 * the response is HTTP 200. Does not throw on failure.
	 *
	 * @since  1.0.0
	 * @return bool True if the remote API is reachable and returns 200.
	 */
	public function ping(): bool {
		$url      = trailingslashit( $this->base_url ) . 'wp-json/';
		$response = wp_remote_get(
			$url,
			array(
				'timeout' => 10,
				'headers' => array(
					'Authorization' => $this->get_auth_header(),
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			return false;
		}

		return 200 === (int) wp_remote_retrieve_response_code( $response );
	}

	/**
	 * Performs a GET request to a REST API endpoint.
	 *
	 * @since  1.0.0
	 * @param  string $path   Endpoint path relative to /wp-json/wp/v2/ (e.g. 'posts').
	 * @param  array  $params Query string parameters.
	 * @return array          Decoded JSON response body.
	 * @throws \RuntimeException On WP_Error or non-2xx HTTP response.
	 */
	public function get( string $path, array $params = array() ): array {
		$url      = add_query_arg( $params, $this->endpoint( $path ) );
		$response = wp_remote_get( $url, $this->default_args() );
		return $this->parse( $response );
	}

	/**
	 * Performs a POST request to a REST API endpoint.
	 *
	 * @since  1.0.0
	 * @param  string $path Endpoint path relative to /wp-json/wp/v2/.
	 * @param  array  $body Request body (will be JSON-encoded).
	 * @return array        Decoded JSON response body.
	 * @throws \RuntimeException On WP_Error or non-2xx HTTP response.
	 */
	public function post( string $path, array $body ): array {
		$response = wp_remote_post(
			$this->endpoint( $path ),
			array_merge(
				$this->default_args(),
				array( 'body' => wp_json_encode( $body ) )
			)
		);
		return $this->parse( $response );
	}

	/**
	 * Performs a PUT request to a REST API endpoint.
	 *
	 * @since  1.0.0
	 * @param  string $path Endpoint path relative to /wp-json/wp/v2/.
	 * @param  array  $body Request body (will be JSON-encoded).
	 * @return array        Decoded JSON response body.
	 * @throws \RuntimeException On WP_Error or non-2xx HTTP response.
	 */
	public function put( string $path, array $body ): array {
		$response = wp_remote_request(
			$this->endpoint( $path ),
			array_merge(
				$this->default_args(),
				array(
					'method' => 'PUT',
					'body'   => wp_json_encode( $body ),
				)
			)
		);
		return $this->parse( $response );
	}

	/**
	 * Performs a DELETE request to a REST API endpoint.
	 *
	 * @since  1.0.0
	 * @param  string $path Endpoint path relative to /wp-json/wp/v2/.
	 * @return array        Decoded JSON response body.
	 * @throws \RuntimeException On WP_Error or non-2xx HTTP response.
	 */
	public function delete( string $path ): array {
		$response = wp_remote_request(
			$this->endpoint( $path ),
			array_merge(
				$this->default_args(),
				array( 'method' => 'DELETE' )
			)
		);
		return $this->parse( $response );
	}

	/**
	 * Uploads a binary file to the remote site's media library.
	 *
	 * Reads the file at $file_path and sends it as a raw POST body with
	 * the appropriate Content-Type and Content-Disposition headers so
	 * the remote REST API can create a media attachment.
	 *
	 * @since  1.0.0
	 * @param  string $file_path  Absolute local path to the file.
	 * @param  string $filename   Filename to use on the remote site.
	 * @param  string $mime_type  MIME type (e.g. 'image/jpeg').
	 * @return array              Decoded JSON response body (includes remote attachment ID).
	 * @throws \RuntimeException  On WP_Error or non-2xx HTTP response.
	 */
	public function upload_media( string $file_path, string $filename, string $mime_type ): array {
		$response = wp_remote_post(
			$this->endpoint( 'media' ),
			array(
				'timeout' => $this->timeout,
				'headers' => array(
					'Authorization'       => $this->get_auth_header(),
					'Content-Type'        => $mime_type,
					'Content-Disposition' => 'attachment; filename="' . $filename . '"',
				),
				'body'    => file_get_contents( $file_path ), // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			)
		);
		return $this->parse( $response );
	}

	/**
	 * Builds the full REST API endpoint URL for a given path.
	 *
	 * @since  1.0.0
	 * @param  string $path Endpoint path relative to /wp-json/wp/v2/.
	 * @return string       Full URL.
	 */
	private function endpoint( string $path ): string {
		return trailingslashit( $this->base_url ) . 'wp-json/wp/v2/' . ltrim( $path, '/' );
	}

	/**
	 * Returns the default request arguments array for authenticated requests.
	 *
	 * @since  1.0.0
	 * @return array wp_remote_*() args with Authorization and Content-Type headers.
	 */
	private function default_args(): array {
		return array(
			'timeout' => $this->timeout,
			'headers' => array(
				'Authorization' => $this->get_auth_header(),
				'Content-Type'  => 'application/json',
			),
		);
	}

	/**
	 * Parses a wp_remote_*() response and returns the decoded body.
	 *
	 * @since  1.0.0
	 * @param  array|\WP_Error $response Response from a wp_remote_*() function.
	 * @return array                     Decoded JSON body array.
	 * @throws \RuntimeException         On WP_Error or non-2xx status code.
	 */
	private function parse( $response ): array {
		if ( is_wp_error( $response ) ) {
			throw new \RuntimeException( $response->get_error_message() );
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$body = json_decode( wp_remote_retrieve_body( $response ), true ) ?? array();

		if ( $code < 200 || $code >= 300 ) {
			$message = $body['message'] ?? sprintf( 'HTTP %d', $code );
			throw new \RuntimeException( $message, $code );
		}

		return $body;
	}
}
