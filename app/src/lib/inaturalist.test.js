// =============================================================================
// src/lib/inaturalist.test.js
// SISE — Tests for the iNaturalist observation mapper.
//
// @package SISE
// @since   1.0.36
// =============================================================================

'use strict';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapObservations } from '../providers/inaturalist.js';
import { filterByOrientation } from '../../public/image-shape.js';

const photo = (id, dims) => ({
  id,
  url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/square.jpg`,
  license_code: 'cc-by',
  ...(dims ? { original_dimensions: dims } : {}),
});

const obs = (id, photos) => ({
  id,
  species_guess: 'Blue crab',
  user: { login: 'ann' },
  photos,
});

describe('mapObservations', () => {
  it('uses original_dimensions for width and height', () => {
    const [img] = mapObservations([obs(1, [photo(10, { width: 2048, height: 1365 })])]);
    assert.equal(img.width, 2048);
    assert.equal(img.height, 1365);
    assert.equal(img.id, 'inaturalist-10');
    assert.match(img.thumb, /\/large\.jpg$/);
    assert.match(img.full, /\/original\.jpg$/);
  });

  it('writes the photo licence as readable text, and none when the code is missing', () => {
    const [a] = mapObservations([obs(1, [{ ...photo(30), license_code: 'cc-by-nc' }])]);
    assert.equal(a.license, 'CC BY-NC');
    const [b] = mapObservations([obs(1, [{ ...photo(31), license_code: null }])]);
    assert.equal(b.license, '');
  });

  it('keeps size unknown (0) when original_dimensions is missing', () => {
    const [img] = mapObservations([obs(1, [photo(11)])]);
    assert.equal(img.width, 0);
    assert.equal(img.height, 0);
  });

  it('lets the orientation filter work on real sizes', () => {
    const images = mapObservations([obs(1, [
      photo(20, { width: 2048, height: 1365 }),   // landscape
      photo(21, { width: 1021, height: 1277 }),   // portrait
      photo(22),                                  // unknown, always kept
    ])]);
    assert.deepEqual(
      filterByOrientation(images, 'portrait').map((i) => i.id),
      ['inaturalist-21', 'inaturalist-22'],
    );
  });

  it('caps the provider at 20 images', () => {
    const many = Array.from({ length: 30 }, (_, i) => photo(100 + i, { width: 800, height: 600 }));
    assert.equal(mapObservations([obs(1, many)]).length, 20);
  });

  it('tolerates missing photos arrays', () => {
    assert.deepEqual(mapObservations([{ id: 1 }]), []);
    assert.deepEqual(mapObservations(undefined), []);
  });
});
