/* =============================================================================
 * app.js
 * IMGverse Search — Vanilla JS frontend entry point.
 * Boots the tabbed shell, the Search tab and the Bulk keywords tab.
 *
 * @package IMGverse-Search
 * @since   1.0.0
 * ============================================================================= */

'use strict';

import { initShell } from './shell.js?v=2.0.0';
import { initSearchMode } from './search-mode.js?v=2.0.0';
import { initBulkMode } from './bulk-mode.js?v=2.0.0';

initShell();
initSearchMode();
initBulkMode();
