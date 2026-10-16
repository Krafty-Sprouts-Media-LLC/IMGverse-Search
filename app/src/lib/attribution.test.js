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

  it('adds the licence for iNaturalist and Openverse too', () => {
    assert.equal(
      buildAttributionCaption({ credit: 'ann', provider: 'inaturalist', license: 'CC BY-NC' }),
      'Photo by ann / iNaturalist (CC BY-NC)'
    );
    assert.equal(
      buildAttributionCaption({ credit: 'Bo', provider: 'openverse', license: 'CC BY-SA 4.0' }),
      'Photo by Bo / Openverse (CC BY-SA 4.0)'
    );
  });

  it('caps an overlong credit at 80 characters, whatever the provider', () => {
    const caption = buildAttributionCaption({ credit: 'thank you one million views '.repeat(10), provider: 'openverse' });
    assert.ok(caption.startsWith('Photo by thank you one million views'));
    assert.ok(caption.endsWith(' / Openverse'));
    assert.ok(caption.length <= 'Photo by '.length + 80 + ' / Openverse'.length);
    assert.ok(caption.includes('…'));
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
