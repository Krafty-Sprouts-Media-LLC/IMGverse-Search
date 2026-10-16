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
import { LICENCE_PROVIDERS, describeImage, formatLicence, imageTitle, providerName } from '../../public/image-meta.js';

describe('formatLicence', () => {
  it('writes Creative Commons codes the way people read them', () => {
    assert.equal(formatLicence('by-sa', '4.0'), 'CC BY-SA 4.0');
    assert.equal(formatLicence('cc-by-nc'), 'CC BY-NC');
    assert.equal(formatLicence('by-nc-nd', '2.0'), 'CC BY-NC-ND 2.0');
    assert.equal(formatLicence('cc0'), 'CC0');
    assert.equal(formatLicence('pdm'), 'Public Domain Mark');
  });
  it('returns nothing for blank, generic or unknown codes', () => {
    assert.equal(formatLicence(''), '');
    assert.equal(formatLicence(undefined), '');
    assert.equal(formatLicence('cc'), '');
    assert.equal(formatLicence('something-else'), '');
  });
  it('names the providers whose licence must be shown', () => {
    for (const p of ['wikimedia', 'inaturalist', 'openverse']) assert.ok(LICENCE_PROVIDERS.has(p), p);
    assert.equal(LICENCE_PROVIDERS.has('unsplash'), false);
  });
});

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
