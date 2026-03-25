<?php
/**
 * Tests for PostPorter_Media.
 *
 * @package PostPorter
 * @since   1.0.0
 */

use Brain\Monkey\Functions;

/**
 * Unit tests for the PostPorter_Media featured image transfer class.
 *
 * @since 1.0.0
 */
class MediaTest extends \PHPUnit\Framework\TestCase {

	protected function setUp(): void {
		parent::setUp();
		\Brain\Monkey\setUp();
	}

	protected function tearDown(): void {
		\Brain\Monkey\tearDown();
		parent::tearDown();
	}

	public function test_returns_false_when_no_featured_image(): void {
		Functions\when( 'get_post_thumbnail_id' )->justReturn( 0 );

		$mock_api = $this->createMock( PostPorter_API::class );
		$media    = new PostPorter_Media( $mock_api );
		$result   = $media->transfer_featured_image( 42 );
		$this->assertFalse( $result );
	}
}
