// =============================================================================
// src/lib/batch-helpers.test.js
// IMGverse Search — Tests for batch download failure reporting.
//
// @package IMGverse-Search
// @since   1.0.34
// =============================================================================

'use strict';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatBatchFailureLine,
  formatBatchFinishMessage,
  messageFromDownloadResponse,
} from '../../public/batch-helpers.js';

describe('formatBatchFinishMessage', () => {
  it('reports a clean finish with no failures', () => {
    assert.equal(formatBatchFinishMessage(16, []), 'Downloaded 16 files.');
    assert.equal(formatBatchFinishMessage(1, []), 'Downloaded 1 file.');
  });

  it('names the error count and points to retry', () => {
    const msg = formatBatchFinishMessage(14, [{ name: 'a' }, { name: 'b' }]);
    assert.match(msg, /Finished with 2 errors/);
    assert.match(msg, /not saved/i);
    assert.match(msg, /retry/i);
  });
});

describe('formatBatchFailureLine', () => {
  it('shows the filename and the download error', () => {
    assert.equal(
      formatBatchFailureLine({ name: 'Ferret laws in Vermont', error: 'HTTP 403' }),
      'Ferret laws in Vermont — HTTP 403'
    );
  });
});

describe('messageFromDownloadResponse', () => {
  it('prefers the server error body over a bare status', () => {
    assert.equal(
      messageFromDownloadResponse(403, 'Domain not allowed: example.com'),
      'Domain not allowed: example.com'
    );
  });

  it('falls back to HTTP status when the body is empty', () => {
    assert.equal(messageFromDownloadResponse(500, '  '), 'HTTP 500');
  });
});
