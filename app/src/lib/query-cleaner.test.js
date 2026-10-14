// =============================================================================
// src/lib/query-cleaner.test.js
// IMGverse Search — Tests for keyword → image search query cleaning.
//
// @package IMGverse-Search
// @since   2.0.0
// =============================================================================

'use strict';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanQuery } from '../../public/query-cleaner.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('cleanQuery', () => {
  it('strips the question templates', () => {
    assert.equal(cleanQuery('can you freeze cooked salmon'), 'cooked salmon');
    assert.equal(cleanQuery('how to freeze corn'), 'corn');
    assert.equal(cleanQuery('what to serve with tri tip'), 'tri tip');
    assert.equal(cleanQuery('traditional finnish breakfast'), 'finnish breakfast');
  });

  it('cuts at qualifier phrases', () => {
    assert.equal(cleanQuery('can you freeze bananas for dogs'), 'bananas');
    assert.equal(cleanQuery('can you freeze soup in mason jars'), 'soup');
    assert.equal(cleanQuery('can you freeze red wine to drink later'), 'red wine');
    assert.equal(cleanQuery('traditional ramadan breakfast in albania'), 'ramadan breakfast');
    assert.equal(cleanQuery('can you freeze pasta with sauce on it'), 'pasta');
  });

  it('drops leading fillers', () => {
    assert.equal(cleanQuery('can you freeze an unopened pack of hot dogs'), 'hot dogs');
    assert.equal(cleanQuery('can you freeze 2-day-old rice'), 'rice');
    assert.equal(cleanQuery('can you freeze leftover alfredo sauce from a jar'), 'alfredo sauce');
  });

  it('normalises case and spacing, and falls back to the keyword when nothing is left', () => {
    assert.equal(cleanQuery('  What To Serve With   Osso Buco '), 'osso buco');
    assert.equal(cleanQuery('can you freeze '), 'can you freeze');
    assert.equal(cleanQuery('mukimo'), 'mukimo');
  });

  it('matches the reviewed snapshot for all 590 keywords', () => {
    const expected = fixture('keywords.expected.tsv').trim().split('\n').map((l) => l.split('\t'));
    const keywords = fixture('keywords.txt').trim().split('\n');
    assert.equal(keywords.length, 590);
    assert.equal(expected.length, 590);
    for (const [keyword, query] of expected) assert.equal(cleanQuery(keyword), query, keyword);
  });
});
