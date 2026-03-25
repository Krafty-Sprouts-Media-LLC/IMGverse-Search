<?php
/**
 * Tests for PostPorter_Post.
 *
 * @package PostPorter
 * @since   1.0.0
 */

use Brain\Monkey\Functions;

/**
 * Unit tests for the PostPorter_Post transfer orchestration class.
 *
 * @since 1.0.0
 */
class PostTest extends \PHPUnit\Framework\TestCase {

	protected function setUp(): void {
		parent::setUp();
		\Brain\Monkey\setUp();
	}

	protected function tearDown(): void {
		\Brain\Monkey\tearDown();
		parent::tearDown();
	}

	private function make_transfer(): PostPorter_Post {
		$mock_meta = $this->createMock( PostPorter_Meta::class );
		$mock_meta->method( 'collect' )->willReturn( array() );

		return new PostPorter_Post(
			$this->createMock( PostPorter_API::class ),
			$this->createMock( PostPorter_Tax::class ),
			$this->createMock( PostPorter_Media::class ),
			$mock_meta
		);
	}

	public function test_build_payload_maps_core_fields(): void {
		Functions\when( 'get_post' )->justReturn(
			(object) array(
				'ID'           => 7,
				'post_title'   => 'Hello World',
				'post_content' => '<p>Content</p>',
				'post_excerpt' => 'Excerpt',
				'post_status'  => 'publish',
				'post_date'    => '2024-01-15 10:00:00',
			)
		);
		Functions\when( 'get_the_terms' )->justReturn( array() );
		Functions\when( 'get_post_thumbnail_id' )->justReturn( 0 );

		$transfer = $this->make_transfer();
		$payload  = $transfer->build_payload( 7, 'publish', true );

		$this->assertEquals( 'Hello World',          $payload['title'] );
		$this->assertEquals( '<p>Content</p>',       $payload['content'] );
		$this->assertEquals( 'publish',              $payload['status'] );
		$this->assertEquals( '2024-01-15 10:00:00',  $payload['date'] );
	}

	public function test_is_syncing_flag_toggles(): void {
		$this->assertFalse( PostPorter_Post::is_syncing() );
		PostPorter_Post::set_syncing( true );
		$this->assertTrue( PostPorter_Post::is_syncing() );
		PostPorter_Post::set_syncing( false );
		$this->assertFalse( PostPorter_Post::is_syncing() );
	}
}
