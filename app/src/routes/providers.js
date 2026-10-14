// =============================================================================
// src/routes/providers.js
// SISE — GET /api/providers/status: per-provider rate budgets.
// Used by the UI to show requests left and paused providers.
//
// @package SISE
// @since   2.0.0
// =============================================================================

'use strict';

import { Router } from 'express';
import { PROVIDERS, budget, snapshotConfigured } from '../providers/index.js';

const router = Router();

// Only providers with an API key are listed; keyless ones are never called.
router.get('/status', (_req, res) => {
  res.json(snapshotConfigured(budget, PROVIDERS));
});

export default router;
