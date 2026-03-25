<?php
/**
 * Boots all PostPorter components and registers WordPress hooks.
 */
class PostPorter_Loader {

    public function init(): void {
        // Components wired up in later tasks.
    }

    public static function activate(): void {
        PostPorter_Log::create_table();
    }

    public static function deactivate(): void {
        // Reserved for future cleanup.
    }
}
