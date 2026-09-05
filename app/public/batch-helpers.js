/**
 * Batch download status helpers.
 * Failures must be named in the UI so the user can retry them —
 * console-only errors are not enough.
 *
 * @package IMGverse-Search
 * @since   1.0.34
 */

'use strict';

/**
 * @param {number} okCount
 * @param {{ name?: string }[]} failures
 * @returns {string}
 */
export function formatBatchFinishMessage(okCount, failures) {
  if (!failures.length) {
    return `Downloaded ${okCount} file${okCount === 1 ? '' : 's'}.`;
  }

  const n = failures.length;
  return `Finished with ${n} error${n === 1 ? '' : 's'}. `
    + `${n === 1 ? 'This image was' : 'These images were'} not saved — retry below.`;
}

/**
 * @param {{ name?: string, error?: string }} failure
 * @returns {string}
 */
export function formatBatchFailureLine(failure) {
  const name = String(failure?.name || '').trim();
  const reason = String(failure?.error || '').trim();
  return reason ? `${name} — ${reason}` : name;
}

/**
 * @param {number} status
 * @param {string} body
 * @returns {string}
 */
export function messageFromDownloadResponse(status, body) {
  const text = String(body || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  return text || `HTTP ${Number(status) || 'error'}`;
}
