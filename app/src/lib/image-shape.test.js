// =============================================================================
// src/lib/image-shape.test.js
// SISE — Tests for shared image shape / orientation rules.
//
// @package SISE
// @since   1.0.36
// =============================================================================

'use strict';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_LONG_EDGE,
  autoPick,
  filterByOrientation,
  isSmall,
  matchesOrientation,
  shapeOf,
} from '../../public/image-shape.js';

describe('isSmall', () => {
  it('flags images whose long edge is under 1000px', () => {
    assert.equal(MIN_LONG_EDGE, 1000);
    assert.equal(isSmall({ width: 999, height: 600 }), true);
    assert.equal(isSmall({ width: 600, height: 1000 }), false);
    assert.equal(isSmall({ width: 1024, height: 683 }), false);
  });
  it('never flags images of unknown size', () => {
    assert.equal(isSmall({ width: 0, height: 0 }), false);
    assert.equal(isSmall({}), false);
  });
});

describe('autoPick', () => {
  const small = { width: 800, height: 500 };
  const tall = { width: 1000, height: 1600 };
  const wide = { width: 1600, height: 900 };
  it('prefers the first image of the right shape that is big enough', () => {
    assert.equal(autoPick([small, tall, wide], 'landscape'), 2);
  });
  it('accepts any shape when no orientation is set', () => {
    assert.equal(autoPick([small, tall, wide], ''), 1);
  });
  it('falls back to the first image when none qualifies', () => {
    assert.equal(autoPick([small, tall], 'square'), 0);
  });
  it('returns null for no images', () => {
    assert.equal(autoPick([], 'landscape'), null);
  });
});

describe('shapeOf', () => {
  it('classifies by width / height ratio', () => {
    assert.equal(shapeOf(1920, 1080), 'landscape');
    assert.equal(shapeOf(1080, 1350), 'portrait');
    assert.equal(shapeOf(1000, 1000), 'square');
  });

  it('treats the exact thresholds as square', () => {
    assert.equal(shapeOf(1150, 1000), 'square');    // 1.15 is not > 1.15
    assert.equal(shapeOf(1151, 1000), 'landscape');
    assert.equal(shapeOf(870, 1000), 'square');     // 0.87 is not < 0.87
    assert.equal(shapeOf(869, 1000), 'portrait');
  });

  it('returns empty string for unknown sizes', () => {
    assert.equal(shapeOf(0, 100), '');
    assert.equal(shapeOf(100, 0), '');
    assert.equal(shapeOf(undefined, undefined), '');
  });
});

describe('matchesOrientation', () => {
  it('matches everything when no orientation is set', () => {
    assert.equal(matchesOrientation({ width: 600, height: 900 }, ''), true);
  });

  it('lets images with unknown size through any filter', () => {
    assert.equal(matchesOrientation({ width: 0, height: 0 }, 'landscape'), true);
    assert.equal(matchesOrientation({}, 'portrait'), true);
  });

  it('ignores unrecognised orientation values like the old filter did', () => {
    assert.equal(matchesOrientation({ width: 600, height: 900 }, 'diagonal'), true);
  });

  it('checks the shape against the requested orientation', () => {
    assert.equal(matchesOrientation({ width: 1200, height: 800 }, 'landscape'), true);
    assert.equal(matchesOrientation({ width: 600, height: 900 }, 'landscape'), false);
    assert.equal(matchesOrientation({ width: 900, height: 900 }, 'square'), true);
  });
});

describe('filterByOrientation', () => {
  const results = [
    { id: 'wide', width: 1200, height: 800 },
    { id: 'tall', width: 600, height: 900 },
    { id: 'box', width: 1000, height: 1000 },
    { id: 'unknown', width: 0, height: 0 },
  ];

  it('returns the same array when no orientation is set', () => {
    assert.equal(filterByOrientation(results, ''), results);
  });

  it('keeps matching shapes plus unknown sizes', () => {
    assert.deepEqual(filterByOrientation(results, 'portrait').map((r) => r.id), ['tall', 'unknown']);
    assert.deepEqual(filterByOrientation(results, 'square').map((r) => r.id), ['box', 'unknown']);
  });
});
