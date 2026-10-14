// =============================================================================
// src/lib/image-proxy.test.js
// SISE — Tests for the shared image fetch/encode module.
//
// @package SISE
// @since   2.0.2
// =============================================================================

'use strict';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import './image-proxy.js';

describe('image-proxy sharp settings', () => {
  // With the libvips cache on, each download left ~70 MB of native memory
  // behind, and the 512 MB app container was OOM-killed after a few large
  // images (nginx then answered 502 Bad Gateway).
  it('turns the libvips operation cache off', () => {
    const { memory, items } = sharp.cache();
    assert.equal(memory.max, 0);
    assert.equal(items.max, 0);
  });
});
