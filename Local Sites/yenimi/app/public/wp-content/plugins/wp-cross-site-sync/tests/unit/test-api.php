<?php
/**
 * Tests for PostPorter_API.
 *
 * @package PostPorter
 * @since   1.0.0
 */

use Brain\Monkey\Functions;

/**
 * Unit tests for the PostPorter_API transport class.
 *
 * @since 1.0.0
 */
class ApiTest extends \PHPUnit\Framework\TestCase {

	protected function setUp(): void {
		parent::setUp();
		\Brain\Monkey\setUp();
	}

	protected function tearDown(): void {
		\Brain\Monkey\tearDown();
		parent::tearDown();
	}

	public function test_builds_correct_auth_header(): void {
		$api    = new PostPorter_API( 'https://example.com', 'admin', 'pass word' );
		$header = $api->get_auth_header();
		$this->assertEquals(
			'Basic ' . base64_encode( 'admin:pass word' ),
			$header
		);
	}

	public function test_ping_returns_true_on_200(): void {
		Functions\when( 'wp_remote_get' )->justReturn( array( 'response' => array( 'code' => 200 ) ) );
		Functions\when( 'wp_remote_retrieve_response_code' )->justReturn( 200 );
		Functions\when( 'is_wp_error' )->justReturn( false );
		Functions\when( 'trailingslashit' )->returnArg( 1 );

		$api    = new PostPorter_API( 'https://example.com', 'admin', 'pass' );
		$result = $api->ping();
		$this->assertTrue( $result );
	}

	public function test_ping_returns_false_on_wp_error(): void {
		Functions\when( 'wp_remote_get' )->justReturn( new \WP_Error( 'http_error', 'Refused' ) );
		Functions\when( 'is_wp_error' )->justReturn( true );
		Functions\when( 'trailingslashit' )->returnArg( 1 );

		$api    = new PostPorter_API( 'https://example.com', 'admin', 'pass' );
		$result = $api->ping();
		$this->assertFalse( $result );
	}
}
