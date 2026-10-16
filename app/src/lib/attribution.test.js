// =============================================================================
// src/lib/attribution.test.js
// SISE — Tests for IPTC caption format (no URLs).
//
// @package SISE
// @since   1.0.35
// =============================================================================

'use strict';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAttributionCaption } from './attribution.js';

describe('buildAttributionCaption', () => {
  it('matches IMGVerse WordPress: Photo by {creator} / {source}', () => {
    assert.equal(
      buildAttributionCaption({
        credit: 'Marek Piwnicki',
        provider: 'unsplash',
        license: 'Unsplash License',
        sourceUrl: 'https://unsplash.com/photos/white-pig-on-brown-soil-PUVVsYJPh78',
      }),
      'Photo by Marek Piwnicki / Unsplash'
    );
  });

  it('does not include a URL or license dump', () => {
    const caption = buildAttributionCaption({
      credit: 'Mathias Grischott',
      provider: 'unsplash',
      license: 'Unsplash License',
      sourceUrl: 'https://unsplash.com/photos/a-small-pig-nG_Y_TG3O-w',
    });
    assert.equal(caption.includes('http'), false);
    assert.equal(caption.includes('License'), false);
  });

  it('falls back to provider only when the author is missing', () => {
    assert.equal(
      buildAttributionCaption({ provider: 'pexels' }),
      'Image from Pexels'
    );
  });

  it('adds the licence for Wikimedia Commons files (CC BY / BY-SA need it)', () => {
    assert.equal(
      buildAttributionCaption({ credit: 'Jo Doe', provider: 'wikimedia', license: 'CC BY-SA 4.0' }),
      'Photo by Jo Doe / Wikimedia Commons (CC BY-SA 4.0)'
    );
    assert.equal(
      buildAttributionCaption({ provider: 'wikimedia', license: 'CC0' }),
      'Image from Wikimedia Commons (CC0)'
    );
  });

  it('leaves the licence off when Wikimedia has none to report, and for other providers', () => {
    assert.equal(
      buildAttributionCaption({ credit: 'Jo Doe', provider: 'wikimedia', license: '' }),
      'Photo by Jo Doe / Wikimedia Commons'
    );
    assert.equal(
      buildAttributionCaption({ credit: 'Ann', provider: 'pexels', license: 'Pexels License' }),
      'Photo by Ann / Pexels'
    );
  });
});
