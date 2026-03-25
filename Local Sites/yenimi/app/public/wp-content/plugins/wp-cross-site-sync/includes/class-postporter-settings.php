<?php
declare(strict_types=1);

/**
 * Manages remote site connections stored in wp_options.
 * Passwords are encrypted with PostPorter_Crypto before storage.
 */
class PostPorter_Settings {

    const OPTION_KEY   = 'postporter_connections';
    const DEFAULTS_KEY = 'postporter_defaults';

    public function get_sites(): array {
        return get_option(self::OPTION_KEY, []);
    }

    public function get_site(string $id): array|false {
        $sites = $this->get_sites();
        return $sites[$id] ?? false;
    }

    public function add_site(array $data): array {
        $sites      = $this->get_sites();
        $id         = uniqid('postporter_site_', true);
        $record     = $this->prepare_record($id, $data);
        $sites[$id] = $record;
        update_option(self::OPTION_KEY, $sites);
        return $record;
    }

    public function update_site(string $id, array $data): array|false {
        $sites = $this->get_sites();
        if (!isset($sites[$id])) {
            return false;
        }
        $sites[$id] = $this->prepare_record($id, $data, $sites[$id]);
        update_option(self::OPTION_KEY, $sites);
        return $sites[$id];
    }

    public function delete_site(string $id): bool {
        $sites = $this->get_sites();
        if (!isset($sites[$id])) {
            return false;
        }
        unset($sites[$id]);
        update_option(self::OPTION_KEY, $sites);
        return true;
    }

    /**
     * Returns the decrypted plaintext password for use in API calls.
     */
    public function get_plaintext_password(string $id): string|false {
        $site = $this->get_site($id);
        if (!$site) {
            return false;
        }
        return PostPorter_Crypto::decrypt($site['password']);
    }

    public function get_defaults(): array {
        return get_option(self::DEFAULTS_KEY, [
            'remote_status'  => 'draft',
            'preserve_date'  => true,
            'meta_whitelist' => [],
        ]);
    }

    private function prepare_record(string $id, array $data, array $existing = []): array {
        $password = $data['password'] ?? '';
        $encrypted_password = $password
            ? PostPorter_Crypto::encrypt($password)
            : ($existing['password'] ?? '');

        return [
            'id'       => $id,
            'label'    => sanitize_text_field($data['label']    ?? ''),
            'url'      => esc_url_raw($data['url']              ?? ''),
            'username' => sanitize_text_field($data['username'] ?? ''),
            'password' => $encrypted_password,
        ];
    }

    // ── Admin page registration ───────────────────────────────────────────────

    public function register_settings_page(): void {
        add_options_page(
            __('PostPorter', 'post-porter'),
            __('PostPorter', 'post-porter'),
            'manage_options',
            'postporter-settings',
            [$this, 'render_settings_page']
        );
    }

    public function render_settings_page(): void {
        if (!current_user_can('manage_options')) {
            return;
        }
        $sites    = $this->get_sites();
        $defaults = $this->get_defaults();
        require POSTPORTER_PLUGIN_DIR . 'admin/views/settings-page.php';
    }

    public function register_log_page(): void {
        add_management_page(
            __('PostPorter Sync Log', 'post-porter'),
            __('PostPorter Log', 'post-porter'),
            'manage_options',
            'postporter-sync-log',
            [$this, 'render_log_page']
        );
    }

    public function render_log_page(): void {
        if (!current_user_can('manage_options')) {
            return;
        }
        $entries = PostPorter_Log::get_entries(100);
        require POSTPORTER_PLUGIN_DIR . 'admin/views/sync-log.php';
    }
}
