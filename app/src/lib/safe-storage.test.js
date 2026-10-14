// =============================================================================
// src/lib/safe-storage.test.js
// IMGverse Search — Tests for the throw-proof sessionStorage wrapper.
//
// @package IMGverse-Search
// @since   1.0.36
// =============================================================================

'use strict';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  storageGet,
  storageGetJSON,
  storageRemove,
  storageSet,
} from '../../public/safe-storage.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

const throwing = {
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('QuotaExceededError'); },
  removeItem() { throw new Error('SecurityError'); },
};

describe('safe-storage with working storage', () => {
  it('round-trips values', () => {
    const s = memoryStorage();
    assert.equal(storageSet('a', '1', s), true);
    assert.equal(storageGet('a', s), '1');
    assert.equal(storageRemove('a', s), true);
    assert.equal(storageGet('a', s), null);
  });

  it('parses JSON and falls back on bad JSON', () => {
    const s = memoryStorage();
    s.setItem('ok', '[1,2]');
    s.setItem('bad', '{not json');
    assert.deepEqual(storageGetJSON('ok', [], s), [1, 2]);
    assert.deepEqual(storageGetJSON('bad', [], s), []);
    assert.deepEqual(storageGetJSON('missing', ['x'], s), ['x']);
  });
});

/** Run fn with console.warn stubbed; returns the captured call args. */
async function captureWarn(fn) {
  const original = console.warn;
  const calls = [];
  console.warn = (...args) => { calls.push(args); };
  try {
    await fn();
  } finally {
    console.warn = original;
  }
  return calls;
}

describe('safe-storage with blocked storage', () => {
  it('never throws when every call throws', async () => {
    await captureWarn(() => {
      assert.equal(storageGet('a', throwing), null);
      assert.equal(storageSet('a', '1', throwing), false);
      assert.equal(storageRemove('a', throwing), false);
      assert.deepEqual(storageGetJSON('a', [], throwing), []);
    });
  });

  it('never throws when sessionStorage itself is unavailable', () => {
    // Node has no sessionStorage, which models the data: URL case.
    assert.equal(storageGet('a'), null);
    assert.equal(storageSet('a', '1'), false);
    assert.equal(storageRemove('a'), false);
  });

  it('logs one prefixed warning when reading sessionStorage throws', async () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() { throw new Error('SecurityError'); },
    });
    try {
      const mod = await import('../../public/safe-storage.js?fresh=blocked');
      const calls = await captureWarn(() => {
        assert.equal(mod.storageSet('a', '1'), false);
        assert.equal(mod.storageGet('a'), null);
      });
      assert.equal(calls.length, 1);
      assert.ok(String(calls[0][0]).startsWith('[IMGverse/storage]'));
    } finally {
      delete globalThis.sessionStorage;
    }
  });

  it('logs nothing when sessionStorage is plainly absent', async () => {
    const mod = await import('../../public/safe-storage.js?fresh=absent');
    const calls = await captureWarn(() => {
      assert.equal(mod.storageSet('a', '1'), false);
      assert.equal(mod.storageGet('a'), null);
    });
    assert.equal(calls.length, 0);
  });
});
