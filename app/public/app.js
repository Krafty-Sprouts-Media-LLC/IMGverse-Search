/* =============================================================================
 * app.js
 * IMGverse Search — Vanilla JS frontend entry point.
 * Boots the tabbed shell and the Search tab (Bulk keywords arrives in Part 4).
 *
 * @package IMGverse-Search
 * @since   1.0.0
 * ============================================================================= */

'use strict';

import { initShell } from './shell.js?v=2.0.0';
import { initSearchMode } from './search-mode.js?v=2.0.0';

initShell();
initSearchMode();
