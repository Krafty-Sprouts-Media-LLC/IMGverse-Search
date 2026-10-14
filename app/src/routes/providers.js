// =============================================================================
// src/routes/providers.js
// IMGverse Search — GET /api/providers/status: per-provider rate budgets.
// Used by the UI to show requests left and paused providers.
//
// @package IMGverse-Search
// @since   2.0.0
// =============================================================================

'use strict';

import { Router } from 'express';
import { budget } from '../providers/index.js';

const router = Router();

router.get('/status', (_req, res) => {
  res.json(budget.snapshot());
});

export default router;
