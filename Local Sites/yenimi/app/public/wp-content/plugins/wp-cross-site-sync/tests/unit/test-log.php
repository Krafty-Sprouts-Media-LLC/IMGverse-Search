<?php
/**
 * Tests for PostPorter_Log.
 *
 * @package PostPorter
 * @since   1.0.0
 */

use Brain\Monkey\Functions;

/**
 * Unit tests for the PostPorter_Log class.
 *
 * @since 1.0.0
 */
class LogTest extends \PHPUnit\Framework\TestCase {

	/**
	 * Sets up Brain Monkey before each test.
	 *
	 * @since  1.0.0
	 * @return void
	 */
	protected function setUp(): void {
		parent::setUp();
		\Brain\Monkey\setUp();
		Functions\when( 'sanitize_text_field' )->returnArg( 1 );
		Functions\when( 'sanitize_key' )->returnArg( 1 );
		Functions\when( 'wp_kses_post' )->returnArg( 1 );
		Functions\when( 'current_time' )->justReturn( '2026-03-25 10:00:00' );
	}

	/**
	 * Tears down Brain Monkey after each test.
	 *
	 * @since  1.0.0
	 * @return void
	 */
	protected function tearDown(): void {
		\Brain\Monkey\tearDown();
		parent::tearDown();
	}

	/**
	 * Tests that build_entry() returns an array with all required keys.
	 *
	 * @since  1.0.0
	 * @return void
	 */
	public function test_build_entry_has_required_keys(): void {
		$entry = PostPorter_Log::build_entry(
			array(
				'post_id'    => 5,
				'post_title' => 'Test Post',
				'site_id'    => 'postporter_site_abc',
				'site_label' => 'Homequirer',
				'action'     => 'copy',
				'status'     => 'success',
				'message'    => '',
			)
		);

		$this->assertArrayHasKey( 'post_id',    $entry );
		$this->assertArrayHasKey( 'action',     $entry );
		$this->assertArrayHasKey( 'status',     $entry );
		$this->assertArrayHasKey( 'created_at', $entry );
	}

	/**
	 * Tests that build_entry() throws for an unrecognised action value.
	 *
	 * @since  1.0.0
	 * @return void
	 */
	public function test_action_must_be_valid(): void {
		$this->expectException( \InvalidArgumentException::class );

		PostPorter_Log::build_entry(
			array(
				'post_id'    => 5,
				'post_title' => 'Test',
				'site_id'    => 'x',
				'site_label' => 'X',
				'action'     => 'teleport',
				'status'     => 'success',
				'message'    => '',
			)
		);
	}
}
