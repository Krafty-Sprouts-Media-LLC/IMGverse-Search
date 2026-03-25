<?php
use Brain\Monkey\Functions;

class CryptoTest extends \PHPUnit\Framework\TestCase {

    protected function setUp(): void {
        parent::setUp();
        \Brain\Monkey\setUp();
        Functions\when('get_option')
            ->justReturn('test_auth_key_32_chars_padded!!');
    }

    protected function tearDown(): void {
        \Brain\Monkey\tearDown();
        parent::tearDown();
    }

    public function test_encrypt_decrypt_roundtrip(): void {
        $original  = 'my_app_password_123';
        $encrypted = PostPorter_Crypto::encrypt($original);
        $decrypted = PostPorter_Crypto::decrypt($encrypted);

        $this->assertNotEquals($original, $encrypted);
        $this->assertEquals($original, $decrypted);
    }

    public function test_decrypt_returns_false_on_garbage(): void {
        $result = PostPorter_Crypto::decrypt('not_valid_base64_!!');
        $this->assertFalse($result);
    }
}
