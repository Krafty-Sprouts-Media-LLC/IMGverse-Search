/**
 * Named downloads through /download, one at a time.
 * Shared by the Search tab's batch panel and the Bulk keywords tab.
 *
 * @package SISE
 * @since   2.0.0
 */

'use strict';

import { messageFromDownloadResponse } from './batch-helpers.js?v=1.0.34';

/** Pause between files so browsers don't block a burst of downloads. */
export const DOWNLOAD_GAP_MS = 700;

/**
 * @param {object} img
 * @param {string} name   Filename without extension (the keyword).
 * @param {'web'|'full'} [size]
 * @returns {URLSearchParams}
 */
export function buildDownloadParams(img, name, size = 'web') {
  const params = new URLSearchParams({ url: img.full, name, size });
  if (img.credit)    params.set('credit', img.credit);
  if (img.provider)  params.set('provider', img.provider);
  if (img.license)   params.set('license', img.license);
  if (img.sourceUrl) params.set('sourceUrl', img.sourceUrl);
  return params;
}

/**
 * Fetch one named image from /download and save it.
 *
 * @throws {Error} With the server's message when the download fails.
 */
export async function downloadImage(img, name, size, { fetchImpl = globalThis.fetch, doc = globalThis.document } = {}) {
  const res = await fetchImpl(`/download?${buildDownloadParams(img, name, size)}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(messageFromDownloadResponse(res.status, body));
  }

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = blobUrl;
  anchor.download = `${name}.jpg`;
  doc.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(blobUrl);
}

/**
 * Download every item in order; failures are collected, never thrown.
 *
 * @param {{ img: object, name: string }[]} queue
 * @param {object}   options
 * @param {Function} options.download    (img, name) => Promise<void>
 * @param {Function} [options.onProgress] ({ index, total, name }) => void
 * @param {number}   [options.gapMs]
 * @param {Function} [options.sleep]
 * @returns {Promise<{ img: object, name: string, error: string }[]>}
 */
export async function runDownloadQueue(queue, {
  download,
  onProgress = () => {},
  gapMs = DOWNLOAD_GAP_MS,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const failures = [];
  const total = queue.length;

  for (let i = 0; i < total; i++) {
    const { img, name } = queue[i];
    onProgress({ index: i, total, name });

    try {
      await download(img, name);
    } catch (err) {
      const error = err?.message || 'Download failed';
      failures.push({ img, name, error });
      console.error('[SISE/batch]', name, error);
    }

    if (i < total - 1) await sleep(gapMs);
  }

  return failures;
}
