<?php
/**
 * Tests for PostPorter_Tax.
 *
 * @package PostPorter
 * @since   1.0.0
 */

/**
 * Unit tests for the PostPorter_Tax taxonomy resolver.
 *
 * @since 1.0.0
 */
class TaxTest extends \PHPUnit\Framework\TestCase {

	protected function setUp(): void {
		parent::setUp();
		\Brain\Monkey\setUp();
	}

	protected function tearDown(): void {
		\Brain\Monkey\tearDown();
		parent::tearDown();
	}

	public function test_resolve_returns_existing_term_id(): void {
		$mock_api = $this->createMock( PostPorter_API::class );
		$mock_api->method( 'get' )->willReturn(
			array(
				array( 'id' => 42, 'slug' => 'real-estate', 'name' => 'Real Estate' ),
			)
		);

		$tax    = new PostPorter_Tax( $mock_api );
		$result = $tax->resolve_term( 'categories', 'Real Estate', 'real-estate' );
		$this->assertEquals( 42, $result );
	}

	public function test_resolve_creates_term_if_not_found(): void {
		$mock_api = $this->createMock( PostPorter_API::class );
		$mock_api->method( 'get' )->willReturn( array() );
		$mock_api->method( 'post' )->willReturn( array( 'id' => 99 ) );

		$tax    = new PostPorter_Tax( $mock_api );
		$result = $tax->resolve_term( 'categories', 'New Category', 'new-category' );
		$this->assertEquals( 99, $result );
	}
}
