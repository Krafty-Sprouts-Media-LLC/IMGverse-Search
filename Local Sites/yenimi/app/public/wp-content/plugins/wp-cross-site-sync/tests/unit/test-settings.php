<?php
use Brain\Monkey\Functions;

class SettingsTest extends \PHPUnit\Framework\TestCase {

    protected function setUp(): void {
        parent::setUp();
        \Brain\Monkey\setUp();
        Functions\when('get_option')->justReturn('test_auth_key_32_chars_padded!!');
        Functions\when('sanitize_text_field')->returnArg(1);
        Functions\when('esc_url_raw')->returnArg(1);
        Functions\when('sanitize_key')->returnArg(1);
        Functions\when('update_option')->justReturn(true);
    }

    protected function tearDown(): void {
        \Brain\Monkey\tearDown();
        parent::tearDown();
    }

    public function test_add_site_returns_array_with_id(): void {
        Functions\when('get_option')->alias(function($key, $default = false) {
            if ($key === 'postporter_connections') {
                return [];
            }
            return 'test_auth_key_32_chars_padded!!';
        });

        $settings = new PostPorter_Settings();
        $site = $settings->add_site([
            'label'    => 'Homequirer',
            'url'      => 'https://homequirer.com',
            'username' => 'admin',
            'password' => 'xxxx xxxx xxxx xxxx',
        ]);

        $this->assertArrayHasKey('id', $site);
        $this->assertEquals('Homequirer', $site['label']);
    }

    public function test_password_is_not_stored_in_plaintext(): void {
        Functions\when('get_option')->alias(function($key, $default = false) {
            if ($key === 'postporter_connections') {
                return [];
            }
            return 'test_auth_key_32_chars_padded!!';
        });

        $settings = new PostPorter_Settings();
        $site = $settings->add_site([
            'label'    => 'Test',
            'url'      => 'https://test.com',
            'username' => 'admin',
            'password' => 'my_secret_password',
        ]);

        $this->assertNotEquals('my_secret_password', $site['password']);
    }
}
