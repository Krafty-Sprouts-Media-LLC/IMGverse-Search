// =============================================================================
// src/lib/image-meta.test.js
// SISE — Tests for image provider / description formatting.
//
// @package SISE
// @since   2.0.2
// =============================================================================

'use strict';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { describeImage, imageTitle, providerName } from '../../public/image-meta.js';

describe('providerName', () => {
  it('names the known providers', () => {
    assert.equal(providerName('inaturalist'), 'iNaturalist');
    assert.equal(providerName('openverse'), 'Openverse');
    assert.equal(providerName('pexels'), 'Pexels');
  });
  it('capitalises unknown providers and handles missing ones', () => {
    assert.equal(providerName('flickrish'), 'Flickrish');
    assert.equal(providerName(''), 'Unknown provider');
    assert.equal(providerName(undefined), 'Unknown provider');
  });
});

describe('imageTitle', () => {
  it('collapses whitespace and trims', () => {
    assert.equal(imageTitle({ alt: '  Rakiura   Brown\nKiwi ' }), 'Rakiura Brown Kiwi');
  });
  it('is empty when the provider sent no text', () => {
    assert.equal(imageTitle({}), '');
  });
});

describe('describeImage', () => {
  it('joins title, photographer and provider', () => {
    assert.equal(
      describeImage({ alt: 'Rakiura Brown Kiwi', credit: 'Ann Smith', provider: 'inaturalist' }),
      '“Rakiura Brown Kiwi” · Ann Smith · iNaturalist',
    );
  });
  it('leaves out what is missing but always names the provider', () => {
    assert.equal(describeImage({ credit: 'Ann', provider: 'pexels' }), 'Ann · Pexels');
    assert.equal(describeImage({ alt: 'Corn', provider: 'pixabay' }), '“Corn” · Pixabay');
    assert.equal(describeImage({}), 'Unknown provider');
  });
});
