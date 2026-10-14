/* =============================================================================
 * app.js
 * SISE — Vanilla JS frontend entry point.
 * Boots the tabbed shell, the Search tab and the Bulk keywords tab.
 *
 * @package SISE
 * @since   1.0.0
 * ============================================================================= */

'use strict';

import { migrateKeys } from './safe-storage.js?v=2.0.0';
import { initShell } from './shell.js?v=2.0.0';
import { initSearchMode } from './search-mode.js?v=2.0.0';
import { initBulkMode } from './bulk-mode.js?v=2.0.0';

// Saved batches, Opened marks and bulk runs from IMGverse Search carry over.
migrateKeys('imgverse:', 'sise:');

initShell();
initSearchMode();
initBulkMode();
