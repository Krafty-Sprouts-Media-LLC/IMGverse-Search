<?php
/**
 * Tests for PostPorter_Meta.
 *
 * @package PostPorter
 * @since   1.0.0
 */

use Brain\Monkey\Functions;

/**
 * Unit tests for the PostPorter_Meta collector class.
 *
 * @since 1.0.0
 */
class MetaTest extends \PHPUnit\Framework\TestCase {

	protected function setUp(): void {
		parent::setUp();
		\Brain\Monkey\setUp();
	}

	protected function tearDown(): void {
		\Brain\Monkey\tearDown();
		parent::tearDown();
	}

	public function test_collects_yoast_meta_when_active(): void {
		Functions\when( 'get_post_meta' )->alias(
			function ( $post_id, $key, $single ) {
				$data = array(
					'_yoast_wpseo_title'    => 'My SEO Title',
					'_yoast_wpseo_metadesc' => 'My description',
				);
				return $data[ $key ] ?? '';
			}
		);

		$meta   = new PostPorter_Meta( array( 'yoast' ) );
		$result = $meta->collect( 1 );

		$this->assertEquals( 'My SEO Title', $result['_yoast_wpseo_title'] );
	}

	public function test_custom_whitelist_keys_are_collected(): void {
		Functions\when( 'get_post_meta' )->alias(
			function ( $post_id, $key, $single ) {
				return 'my_custom_field' === $key ? 'custom_value' : '';
			}
		);
		Functions\when( 'sanitize_key' )->returnArg( 1 );

		$meta   = new PostPorter_Meta( array(), array( 'my_custom_field' ) );
		$result = $meta->collect( 1 );

		$this->assertEquals( 'custom_value', $result['my_custom_field'] );
	}
}
