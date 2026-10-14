// =============================================================================
// src/lib/shell.test.js
// SISE — Tests for tab routing helpers.
//
// @package SISE
// @since   2.0.0
// =============================================================================

'use strict';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TABS, tabFromHash } from '../../public/shell.js';

describe('tabFromHash', () => {
  it('knows both tabs', () => {
    assert.deepEqual(TABS, ['search', 'bulk']);
  });
  it('reads the tab from the URL hash', () => {
    assert.equal(tabFromHash('#bulk'), 'bulk');
    assert.equal(tabFromHash('#search'), 'search');
    assert.equal(tabFromHash('#BULK'), 'bulk');
  });
  it('falls back to search for empty or unknown hashes', () => {
    assert.equal(tabFromHash(''), 'search');
    assert.equal(tabFromHash('#'), 'search');
    assert.equal(tabFromHash('#settings'), 'search');
    assert.equal(tabFromHash(undefined), 'search');
  });
});
