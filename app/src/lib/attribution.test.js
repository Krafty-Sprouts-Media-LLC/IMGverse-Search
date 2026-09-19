// =============================================================================
// src/lib/attribution.test.js
// IMGverse Search — Tests for IPTC caption format (no URLs).
//
// @package IMGverse-Search
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
});
