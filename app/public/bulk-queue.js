/**
 * Bulk keywords queue: one row per keyword, searched only near where the
 * user is reading, at most two searches at a time. Providers that are
 * paused (rate limits) are remembered per row and topped up later, so a
 * paused provider never blocks the run. No DOM; bulk-mode.js renders it.
 *
 * @package SISE
 * @since   2.0.0
 */

'use strict';

import { cleanQuery } from './query-cleaner.js?v=2.0.0';
import { autoPick } from './image-shape.js?v=2.0.0';
import { imageKey } from './search-client.js?v=2.0.0';

/** Rows searched ahead of the reading position. */
export const LOOKAHEAD = 10;
/** Searches allowed in flight at once. */
export const CONCURRENCY = 2;
/** How long Openverse rests after it answers HTTP 429. */
export const OPENVERSE_BACKOFF_MS = 60_000;
/** Keywords per run (keeps the page responsive). */
export const MAX_KEYWORDS = 1000;

function newRow(keyword) {
  return {
    keyword,
    query: cleanQuery(keyword),
    state: 'queued',          // queued | loading | done | empty | error
    images: [],
    pick: null,
    skipped: false,
    pending: [],              // providers to top up later
    error: '',
    edited: false,
    savedPickKey: null,
    /** The user unselected this row's image; don't auto-pick it again until a fresh search. */
    cleared: false,
    /** imageKey of the image last downloaded for this row. */
    downloadedKey: null,
    token: 0,
  };
}

function pausedProviders(providerStatus) {
  return Object.entries(providerStatus || {})
    .filter(([, s]) => s?.status === 'paused')
    .map(([name]) => name);
}

/**
 * @param {object}   deps
 * @param {Function} deps.search    ({ query, orientation, providers }) => Promise<{ results, providerStatus }>
 *                                  providers: null = everything enabled, [name] = top-up of one provider.
 * @param {Function} [deps.now]
 * @param {Function} [deps.schedule] (fn, ms) => cancel
 * @param {Function} [deps.onChange] Called after every state change.
 */
export function createBulkQueue({
  search,
  now = () => Date.now(),
  schedule = (fn, ms) => { const id = setTimeout(fn, ms); return () => clearTimeout(id); },
  onChange = () => {},
}) {
  let rows = [];
  let orientation = '';
  let readPos = 0;
  let paused = false;
  let openverseResumeAt = 0;
  let cancelOpenverseTimer = null;
  let canTopUp = () => true;
  /** Real requests in flight, including ones for rows since re-queued or replaced. */
  let inFlight = 0;
  /** Bumped by load(); results from an older run are ignored. */
  let generation = 0;
  const topUpsRunning = new Set();

  const inWindow = (i) => i <= readPos + LOOKAHEAD;

  function choosePick(row) {
    if (row.cleared) return null;
    if (row.savedPickKey) {
      const i = row.images.findIndex((img) => imageKey(img) === row.savedPickKey);
      row.savedPickKey = null;
      if (i !== -1) return i;
    }
    return autoPick(row.images, orientation);
  }

  function restOpenverse() {
    if (cancelOpenverseTimer) return;
    openverseResumeAt = now() + OPENVERSE_BACKOFF_MS;
    cancelOpenverseTimer = schedule(() => {
      cancelOpenverseTimer = null;
      openverseResumeAt = 0;
      onChange();
      topUp('openverse');
    }, OPENVERSE_BACKOFF_MS);
  }

  async function runRow(row) {
    const token = ++row.token;
    const gen = generation;
    const stale = () => gen !== generation || token !== row.token;
    row.state = 'loading';
    row.error = '';
    inFlight++;
    onChange();

    try {
      const out = await search({ query: row.query, orientation, providers: null });
      if (!stale()) {
        const images = Array.isArray(out?.results) ? out.results : [];
        row.images = images;
        row.pending = pausedProviders(out?.providerStatus);
        if (!images.length && out?.error) {
          // The search failed (network, server error): say so, don't blame the query.
          row.state = 'error';
          row.error = out.error;
          row.pick = null;
        } else {
          row.state = images.length ? 'done' : 'empty';
          row.pick = choosePick(row);
        }
        if (row.pending.includes('openverse')) restOpenverse();
      }
    } catch (err) {
      if (!stale()) {
        console.error('[SISE/bulk] search failed for', JSON.stringify(row.query), err?.message || err);
        row.state = 'error';
        row.error = err?.message || 'Search failed';
        row.images = [];
        row.pick = null;
        row.pending = [];
      }
    } finally {
      inFlight--;
    }

    if (gen !== generation) return;
    onChange();
    pump();
  }

  /** Start queued rows inside the window, nearest the reading position first (ahead before behind). */
  function pump() {
    if (paused) return;
    const candidates = [];
    rows.forEach((row, i) => {
      if (row.state === 'queued' && !row.skipped && inWindow(i)) candidates.push(i);
    });
    candidates.sort((a, b) => (Math.abs(a - readPos) - Math.abs(b - readPos)) || (a < readPos) - (b < readPos));
    for (const i of candidates) {
      if (inFlight >= CONCURRENCY) break;
      runRow(rows[i]);
    }
  }

  /** @returns {Promise<'paused'|undefined>} 'paused' when the provider refused again. */
  async function topUpRow(row, provider) {
    const token = row.token;
    const gen = generation;
    try {
      const out = await search({ query: row.query, orientation, providers: [provider] });
      if (gen !== generation || token !== row.token) return undefined;
      if (out?.providerStatus?.[provider]?.status === 'paused') {
        if (provider === 'openverse') restOpenverse();
        return 'paused';
      }
      const seen = new Set(row.images.map(imageKey));
      const extra = (out?.results || []).filter((img) => !seen.has(imageKey(img)));
      row.images = row.images.concat(extra);
      row.pending = row.pending.filter((p) => p !== provider);
      if (row.images.length) {
        row.state = 'done';
        if (row.pick == null && !row.cleared) row.pick = autoPick(row.images, orientation);
      }
    } catch (err) {
      console.error(`[SISE/bulk] ${provider} top-up failed for`, JSON.stringify(row.query), err?.message || err);
    }
    onChange();
  }

  /** Re-ask one provider for every row waiting on it, nearest the reading position first. */
  async function topUp(provider) {
    if (topUpsRunning.has(provider) || !canTopUp(provider)) return;
    topUpsRunning.add(provider);
    try {
      const waiting = rows
        .map((row, i) => ({ row, i }))
        .filter(({ row }) => !row.skipped && row.state !== 'loading' && row.pending.includes(provider))
        .sort((a, b) => Math.abs(a.i - readPos) - Math.abs(b.i - readPos));
      for (const { row } of waiting) {
        if (paused) break;
        // Stop at once if the provider refuses again; its rest timer will retry.
        if (await topUpRow(row, provider) === 'paused') break;
      }
    } finally {
      topUpsRunning.delete(provider);
    }
  }

  /** A fresh search: new results get a fresh auto-pick, even if the old pick was cleared. */
  function requeue(row) {
    row.token++;
    row.state = 'queued';
    row.images = [];
    row.pick = null;
    row.cleared = false;
    row.pending = [];
    row.error = '';
  }

  function isDownloaded(row) {
    return Boolean(row.downloadedKey) && row.pick != null && row.images[row.pick]
      && imageKey(row.images[row.pick]) === row.downloadedKey;
  }

  function load(keywords, { orientation: o = '', saved = null } = {}) {
    generation++;
    if (cancelOpenverseTimer) { cancelOpenverseTimer(); cancelOpenverseTimer = null; }
    openverseResumeAt = 0;

    const seen = new Set();
    const list = [];
    for (const k of keywords || []) {
      const keyword = String(k || '').trim();
      if (!keyword || seen.has(keyword)) continue;
      seen.add(keyword);
      list.push(keyword);
      if (list.length >= MAX_KEYWORDS) break;
    }

    rows = list.map(newRow);
    orientation = o;
    readPos = 0;

    if (saved) {
      readPos = Math.max(0, Number(saved.readPos) || 0);
      (saved.rows || []).forEach((s, i) => {
        const row = rows[i];
        if (!row || !s) return;
        if (s.query) { row.query = s.query; row.edited = true; }
        row.savedPickKey = s.pickKey || null;
        row.skipped = Boolean(s.skipped);
        row.cleared = Boolean(s.cleared);
        row.downloadedKey = s.downloadedKey || null;
      });
    }

    onChange();
    pump();
  }

  return {
    get rows() { return rows; },
    get readPos() { return readPos; },
    get paused() { return paused; },
    get orientation() { return orientation; },
    /** ms epoch when Openverse may be asked again; 0 when it is not resting. */
    get openverseResumeAt() { return openverseResumeAt; },
    /** (provider) => boolean — false for providers the user switched off. */
    get canTopUp() { return canTopUp; },
    set canTopUp(fn) { canTopUp = typeof fn === 'function' ? fn : () => true; },

    load,
    inWindow,
    topUp,

    /** Forget a provider rows were waiting on (e.g. the user switched it off). */
    dropPending(provider) {
      rows.forEach((row) => { row.pending = row.pending.filter((p) => p !== provider); });
      onChange();
    },

    setReadPos(i) {
      readPos = Math.max(0, Math.min(rows.length - 1, Number(i) || 0));
      onChange();
      pump();
    },

    setOrientation(o) {
      orientation = o;
      rows.forEach((row) => { if (!row.skipped) requeue(row); });
      onChange();
      pump();
    },

    setQuery(i, query) {
      const row = rows[i];
      if (!row) return;
      const q = String(query || '').trim();
      if (q) row.query = q;
      row.edited = true;
      requeue(row);
      onChange();
      pump();
    },

    retry(i) {
      const row = rows[i];
      if (!row) return;
      requeue(row);
      onChange();
      pump();
    },

    /** Select image j; picking the selected image again unselects it. */
    pick(i, j) {
      const row = rows[i];
      if (!row || row.skipped || !row.images[j]) return;
      if (row.pick === j) {
        row.pick = null;
        row.cleared = true;
      } else {
        row.pick = j;
        row.cleared = false;
      }
      onChange();
    },

    /** Leave this keyword without an image (it won't be downloaded). */
    clearPick(i) {
      const row = rows[i];
      if (!row) return;
      row.pick = null;
      row.cleared = true;
      onChange();
    },

    /** Record that `img` was saved for row i. */
    markDownloaded(i, img) {
      const row = rows[i];
      if (!row || !img) return;
      row.downloadedKey = imageKey(img);
      onChange();
    },

    /** True when the row's current pick is the image already downloaded. */
    isDownloaded(i) {
      const row = rows[i];
      return Boolean(row) && isDownloaded(row);
    },

    toggleSkip(i) {
      const row = rows[i];
      if (!row) return;
      row.skipped = !row.skipped;
      onChange();
      pump();
    },

    pause() {
      paused = true;
      onChange();
    },

    resume() {
      paused = false;
      onChange();
      pump();
      // An Openverse rest may have ended while paused; its top-up stopped then.
      if (!openverseResumeAt) topUp('openverse');
    },

    counts() {
      let done = 0;
      let picked = 0;
      let review = 0;
      let skipped = 0;
      let waiting = 0;
      let downloaded = 0;
      for (const r of rows) {
        if (r.state !== 'queued' && r.state !== 'loading') done++;
        if (r.skipped) { skipped++; continue; }
        if (r.pick != null) picked++;
        if (isDownloaded(r)) downloaded++;
        if (r.pending.length) waiting++;
        if (r.state === 'error' || (r.state === 'empty' && !r.pending.length)) review++;
      }
      const notSelected = rows.length - skipped - picked;
      return { all: rows.length, done, picked, review, skipped, waiting, notSelected, downloaded, toDownload: picked - downloaded };
    },

    snapshot() {
      return {
        keywords: rows.map((r) => r.keyword),
        orientation,
        readPos,
        rows: rows.map((r) => ({
          query: r.edited ? r.query : undefined,
          pickKey: r.pick != null && r.images[r.pick] ? imageKey(r.images[r.pick]) : (r.savedPickKey || null),
          skipped: r.skipped,
          cleared: r.cleared || undefined,
          downloadedKey: r.downloadedKey || undefined,
        })),
      };
    },

    /**
     * Picked, non-skipped rows to download, named after the keyword.
     * By default only rows whose current pick hasn't been downloaded yet.
     */
    downloadList({ onlyNew = true } = {}) {
      return rows
        .map((r, row) => ({ r, row }))
        .filter(({ r }) => !r.skipped && r.pick != null && r.images[r.pick] && !(onlyNew && isDownloaded(r)))
        .map(({ r, row }) => ({ img: r.images[r.pick], name: r.keyword, row }));
    },
  };
}
