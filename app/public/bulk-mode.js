/**
 * Bulk keywords tab: renders the bulk queue (bulk-queue.js), wires the
 * sidebar, keyboard, scrolling, provider budgets and downloads. All search
 * logic lives in bulk-queue.js / search-client.js; this file is DOM only.
 *
 * @package IMGverse-Search
 * @since   2.0.0
 */

'use strict';

import { LOOKAHEAD, MAX_KEYWORDS, createBulkQueue } from './bulk-queue.js?v=2.0.0';
import { searchSources } from './search-client.js?v=2.0.0';
import { isSmall, shapeOf } from './image-shape.js?v=2.0.0';
import { downloadImage, runDownloadQueue } from './download-queue.js?v=2.0.0';
import { formatBatchFailureLine, formatBatchFinishMessage } from './batch-helpers.js?v=1.0.34';
import { storageGetJSON, storageSet } from './safe-storage.js?v=2.0.0';

const STORAGE_KEY = 'sise:bulk';
const PER_ROW = 6;
const STATUS_POLL_MS = 15_000;
const NAMES = { openverse: 'Openverse', unsplash: 'Unsplash', pexels: 'Pexels', pixabay: 'Pixabay', inaturalist: 'iNaturalist' };

const $ = (id) => document.getElementById(id);
const els = {
    keywords:  $('bulk-keywords'),
    kwCount:   $('bulk-kw-count'),
    providers: $('bulk-providers'),
    run:       $('bulk-run'),
    bar:       $('bulk-progress-bar'),
    progress:  $('bulk-progress-text'),
    rows:      $('bulk-rows'),
    blank:     $('bulk-blank'),
    download:  $('bulk-download'),
    pause:     $('bulk-pause'),
    pulse:     $('bulk-run-pulse'),
    state:     $('bulk-run-state'),
    detail:    $('bulk-run-detail'),
    note:      $('bulk-run-note'),
    dlStatus:  $('bulk-dl-status'),
    dlFails:   $('bulk-dl-failures'),
    retry:     $('bulk-retry'),
};

/* ------------------------------------------------------------------ state */

let filter = 'all';
let active = 0;
let size = 'web';
let downloading = false;
let failures = [];
/** Provider budgets from /api/providers/status (configured server providers only). */
let budgets = {};
/** Providers the user has switched on. Openverse plus every configured server provider by default. */
const enabled = new Set(['openverse']);
const disabledByUser = new Set();
/** Thumbnails shown per row ("+N more" reveals more of the already-fetched results). */
const shown = new Map();
const rowSig = new Map();

const queue = createBulkQueue({ search: searchFor, onChange: scheduleRender });
queue.canTopUp = (name) => (name === 'openverse' ? enabled.has('openverse') : !disabledByUser.has(name));

/* ----------------------------------------------------------- helpers */

function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function clock(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Unique, non-empty lines (the queue drops duplicates too, so the counts match). */
function parseKeywords() {
    return [...new Set(els.keywords.value.split('\n').map((s) => s.replace(/^[-*]\s+/, '').trim()).filter(Boolean))];
}

function serverNames() {
    return Object.keys(budgets);
}

/**
 * Bridge from the queue to the search client, honouring the provider
 * switches and Openverse's rest after a 429. Failures come back as `error`
 * so the row says the search failed instead of "nothing found".
 */
async function searchFor({ query, orientation, providers }) {
    let serverProviders;
    let openverse;
    let openverseResting = false;
    if (providers) {
        const only = providers[0];
        serverProviders = only === 'openverse' ? [] : [only];
        openverse = only === 'openverse';
    } else {
        const all = serverNames();
        const on = all.filter((name) => !disabledByUser.has(name));
        serverProviders = on.length === all.length ? null : on;
        openverse = enabled.has('openverse');
        // Don't ask Openverse while it is resting; mark it pending instead.
        if (openverse && queue.openverseResumeAt > Date.now()) {
            openverse = false;
            openverseResting = true;
        }
    }

    const restingStatus = openverseResting ? { openverse: { status: 'paused' } } : {};
    if (serverProviders && !serverProviders.length && !openverse) {
        return { results: [], providerStatus: restingStatus };
    }

    const out = await searchSources({ q: query, orientation, serverProviders, openverse });
    const openverseFailed = out.openverseError && out.openverseStatus !== 429;
    return {
        results: out.results,
        providerStatus: { ...out.providerStatus, ...restingStatus },
        error: out.results.length ? '' : (out.serverError || (openverseFailed ? out.openverseError : '')),
    };
}

function shownFor(i, row) {
    const base = Math.max(PER_ROW, row.pick != null ? Math.ceil((row.pick + 1) / PER_ROW) * PER_ROW : 0);
    return Math.min(row.images.length, Math.max(base, shown.get(i) || 0));
}

function needsReview(row) {
    return !row.skipped && (row.state === 'error' || (row.state === 'empty' && !row.pending.length));
}

function visible(row) {
    if (filter === 'review') return needsReview(row);
    if (filter === 'picked') return !row.skipped && row.pick != null;
    if (filter === 'skipped') return row.skipped;
    return true;
}

/* ----------------------------------------------------------- rendering */

// A timer, not requestAnimationFrame: rAF stops in background tabs, and a
// bulk run keeps going while the user is in another tab.
let renderQueued = false;
function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    setTimeout(() => {
        renderQueued = false;
        render();
    }, 0);
}

const ICON_SEARCH = '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" d="M21 21l-5-5m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z"/></svg>';
const ICON_CHECK = '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="3.2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function statusHtml(row) {
    if (row.skipped) return '<span class="status status--idle">Skipped</span>';
    if (row.state === 'queued') return '<span class="status status--idle">Queued</span>';
    if (row.state === 'loading') return '<span class="status status--idle">Searching…</span>';
    if (row.state === 'error') return `<span class="status status--warn">${esc(row.error)}</span>`;
    const pending = row.pending.length
        ? `<span class="status status--warn" title="Paused for a rate limit; images are added automatically when it resumes">waiting on ${esc(row.pending.map((p) => NAMES[p] || p).join(', '))}</span>`
        : '';
    if (row.state === 'empty') return `${row.pending.length ? '' : '<span class="status status--warn">No results</span>'}${pending}`;
    return `<span class="status status--ok">${row.images.length} results</span>${pending}`;
}

function stripHtml(row, i) {
    if (row.state === 'queued' && !queue.inWindow(i)) {
        return `<p class="wait-row">Not searched yet. Starts when you are within ${LOOKAHEAD} rows.</p>`;
    }
    if (row.state === 'queued' || row.state === 'loading') {
        return `<div class="strip" aria-hidden="true">${'<div class="thumb thumb--skeleton"></div>'.repeat(5)}</div>`;
    }
    if (needsReview(row)) {
        const msg = row.state === 'error'
            ? `${esc(row.error)}. Wait a moment, then retry.`
            : `Nothing found for <span class="mono">${esc(row.query)}</span>. Try a broader query.`;
        return `<div class="empty-row">${msg}
            <button type="button" class="btn btn-secondary btn-sm" data-act="retry" data-row="${i}">Retry</button>
            <button type="button" class="btn btn-ghost btn-sm" data-act="skip" data-row="${i}">Skip keyword</button></div>`;
    }
    if (!row.images.length) return '';
    const count = shownFor(i, row);
    const thumbs = row.images.slice(0, count).map((img, j) => {
        const shape = shapeOf(img.width, img.height);
        const ratio = img.width && img.height ? img.width / img.height : 4 / 3;
        const width = Math.round(116 * Math.min(1.9, Math.max(0.6, ratio)));
        const dims = img.width ? `${img.width}×${img.height}` : 'size ?';
        return `<button type="button" class="thumb" style="width:${width}px" data-act="pick" data-row="${i}" data-img="${j}"
                    aria-pressed="${row.pick === j}" aria-label="Use image ${j + 1}${img.alt ? `: ${esc(img.alt)}` : ''}, ${esc(dims)}">
                    <img src="${esc(img.thumb)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
                    <span class="thumb__check">${ICON_CHECK}</span>
                    ${j < 9 ? `<span class="thumb__n">${j + 1}</span>` : ''}
                    <span class="thumb__dims${isSmall(img) ? ' thumb__dims--small' : ''}">${shape ? `<span class="shape-ico shape-ico--${shape}" aria-hidden="true"></span>` : ''}${esc(dims)}</span>
                </button>`;
    }).join('');
    const more = count < row.images.length
        ? `<button type="button" class="thumb thumb--more" data-act="more" data-row="${i}">+${Math.min(PER_ROW, row.images.length - count)} more</button>`
        : '';
    return `<div class="strip">${thumbs}${more}</div>`;
}

function rowHtml(row, i) {
    const cls = ['krow', i === active ? 'krow--active' : '', row.skipped ? 'krow--skipped' : ''].filter(Boolean).join(' ');
    return `<article class="${cls}" data-row="${i}" aria-label="${esc(row.keyword)}">
        <span class="krow__idx">${String(i + 1).padStart(2, '0')}</span>
        <div class="krow__head">
            <div class="krow__title">
                <h3>${esc(row.keyword)}</h3>
                <div class="krow__meta">
                    <form class="query" data-row="${i}">
                        ${ICON_SEARCH}
                        <input value="${esc(row.query)}" aria-label="Search query for ${esc(row.keyword)}" spellcheck="false" style="--len:${row.query.length}">
                        <button type="submit">Search</button>
                    </form>
                    ${statusHtml(row)}
                    <span class="fname" title="${esc(row.keyword)}.jpg">${esc(row.keyword)}.jpg</span>
                </div>
            </div>
            <button type="button" class="btn btn-ghost btn-sm" data-act="skip" data-row="${i}">${row.skipped ? 'Restore' : 'Skip'}</button>
        </div>
        ${row.skipped ? '' : stripHtml(row, i)}
    </article>`;
}

/** Selector for the same control in a redrawn row, so keyboard focus survives. */
function focusSelector(el) {
    const act = el.dataset?.act;
    if (!act) return null;
    return act === 'pick' ? `[data-act="pick"][data-img="${el.dataset.img}"]` : `[data-act="${act}"]`;
}

function signature(row, i) {
    return [row.state, row.query, row.pick, row.images.length, row.skipped, row.pending.join(','), row.error,
        i === active, queue.inWindow(i), shownFor(i, row)].join('|');
}

function renderRows() {
    const rows = queue.rows;
    els.blank.classList.toggle('hidden', rows.length > 0);

    const wanted = rows.map((row, i) => (visible(row) ? i : -1)).filter((i) => i !== -1);
    const existing = new Map([...els.rows.children].map((el) => [Number(el.dataset.row), el]));

    // Only a query input being typed in protects its row from a redraw.
    // (A clicked button is focused too; that row must still update.)
    const focused = document.activeElement;
    const typingRow = focused?.matches?.('.query input') ? focused.closest('.krow')?.dataset.row : undefined;

    let prev = null;
    for (const i of wanted) {
        const row = rows[i];
        const sig = signature(row, i);
        let el = existing.get(i);
        if (el && (rowSig.get(i) !== sig) && String(i) !== typingRow) {
            const tpl = document.createElement('template');
            tpl.innerHTML = rowHtml(row, i).trim();
            const fresh = tpl.content.firstElementChild;
            const refocus = el.contains(focused) ? focusSelector(focused) : null;
            el.replaceWith(fresh);
            el = fresh;
            rowSig.set(i, sig);
            if (refocus) fresh.querySelector(refocus)?.focus({ preventScroll: true });
        } else if (!el) {
            const tpl = document.createElement('template');
            tpl.innerHTML = rowHtml(row, i).trim();
            el = tpl.content.firstElementChild;
            rowSig.set(i, sig);
        }
        existing.delete(i);
        const anchor = prev ? prev.nextSibling : els.rows.firstChild;
        if (el !== anchor) els.rows.insertBefore(el, anchor);
        prev = el;
    }
    for (const [i, el] of existing) { el.remove(); rowSig.delete(i); }
}

function renderMeta() {
    const c = queue.counts();
    $('bulk-n-all').textContent = c.all;
    $('bulk-n-review').textContent = c.review;
    $('bulk-n-picked').textContent = c.picked;
    $('bulk-n-skipped').textContent = c.skipped;
    els.download.textContent = downloading ? 'Downloading…' : `Download ${c.picked}`;
    els.download.disabled = downloading || !c.picked;
    els.bar.style.width = c.all ? `${Math.round((c.done / c.all) * 100)}%` : '0';
    els.progress.textContent = !c.all ? 'Nothing searched yet.' : `${c.done} of ${c.all} searched.`;
    renderRunbar(c);
}

function renderRunbar(c = queue.counts()) {
    const rows = queue.rows;
    const loading = rows.some((r) => r.state === 'loading');
    const waitingInWindow = rows.some((r, i) => r.state === 'queued' && !r.skipped && queue.inWindow(i));
    const beyond = rows.filter((r, i) => r.state === 'queued' && !r.skipped && !queue.inWindow(i)).length;

    const waitingOnOpenverse = queue.openverseResumeAt && rows.some((r) => r.pending.includes('openverse'));

    let state = 'Idle';
    let pulse = 'idle';
    if (c.all && queue.paused) { state = 'Paused by you'; pulse = 'paused'; }
    else if (c.all && (loading || waitingInWindow)) { state = 'Searching'; pulse = 'busy'; }
    else if (c.all && waitingOnOpenverse) { state = 'Waiting for Openverse'; pulse = 'paused'; }
    else if (c.all && beyond) { state = 'Caught up'; pulse = 'ok'; }
    else if (c.all) { state = 'All searched'; pulse = 'ok'; }

    els.pulse.className = `pulse pulse--${pulse}`;
    els.state.textContent = state;
    els.detail.textContent = !c.all
        ? 'Paste keywords and press Search keywords.'
        : `${c.done} of ${c.all} searched${beyond ? ` · the next ${beyond} start when you scroll within ${LOOKAHEAD} rows` : ''}`;

    const notes = [];
    const t = Date.now();
    for (const [name, b] of Object.entries(budgets)) {
        if (b.status === 'paused' && b.resumeAt) {
            notes.push(`${NAMES[name] || name} limit reached, back in ${clock(Date.parse(b.resumeAt) - t)}`);
        }
    }
    if (queue.openverseResumeAt) notes.push(`Openverse asked us to slow down, retrying in ${clock(queue.openverseResumeAt - t)}`);
    els.note.textContent = notes.length ? `${notes.join(' · ')}. Other providers keep filling rows.` : '';

    els.pause.disabled = !c.all;
    els.pause.textContent = queue.paused ? 'Resume' : 'Pause';
}

function providerView(name) {
    const t = Date.now();
    const live = name === 'openverse';
    const b = budgets[name];
    const resting = live && queue.openverseResumeAt;
    const paused = Boolean(resting || b?.status === 'paused');
    return {
        paused,
        left: live ? 'no published limit' : `${(b?.remaining ?? 0).toLocaleString()} / ${(b?.limit ?? 0).toLocaleString()}`,
        sub: resting
            ? `Rate limited · retry in ${clock(queue.openverseResumeAt - t)}`
            : paused
                ? `Paused · resets in ${clock(Date.parse(b.resumeAt) - t)}`
                : (live ? 'Searched from your browser' : `Per ${b?.per || 'hour'}`),
        pct: live ? 100 : (b?.limit ? Math.round((b.remaining / b.limit) * 100) : 0),
    };
}

/** Rebuild the list only when the providers change; otherwise update text in place (keeps focus). */
function renderProviders() {
    const names = ['openverse', ...serverNames()];
    const key = names.join(',');
    if (els.providers.dataset.key !== key) {
        els.providers.dataset.key = key;
        els.providers.innerHTML = names.map((name) => {
            const on = name === 'openverse' ? enabled.has('openverse') : !disabledByUser.has(name);
            return `<div class="pstat" data-provider="${esc(name)}">
                <label class="pstat__name"><input type="checkbox" data-provider="${esc(name)}" ${on ? 'checked' : ''}> ${esc(NAMES[name] || name)}</label>
                <span class="pstat__left"></span>
                <div class="meter" aria-hidden="true"><span></span></div>
                <span class="pstat__sub"></span>
            </div>`;
        }).join('');
    }
    for (const el of els.providers.querySelectorAll('.pstat')) {
        const v = providerView(el.dataset.provider);
        el.classList.toggle('pstat--paused', v.paused);
        el.querySelector('.pstat__left').textContent = v.left;
        el.querySelector('.pstat__sub').textContent = v.sub;
        el.querySelector('.meter span').style.width = `${v.pct}%`;
    }
}

function render() {
    renderRows();
    renderMeta();
    persist();
}

/* ----------------------------------------------------------- persistence */

let persistTimer = null;
function writeState() {
    storageSet(STORAGE_KEY, JSON.stringify({
        text: els.keywords.value,
        size,
        disabled: [...disabledByUser],
        openverse: enabled.has('openverse'),
        snapshot: queue.rows.length ? queue.snapshot() : null,
    }));
}

/** Save at most once a second; `pagehide` flushes the last second. */
function persist() {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
        persistTimer = null;
        writeState();
    }, 1000);
}

/** Settings first, then provider budgets, then the run — so switched-off providers stay off. */
async function restore() {
    const saved = storageGetJSON(STORAGE_KEY, null);
    if (saved && typeof saved === 'object') {
        if (typeof saved.text === 'string') els.keywords.value = saved.text;
        if (saved.size === 'full') size = 'full';
        (saved.disabled || []).forEach((name) => disabledByUser.add(name));
        if (saved.openverse === false) enabled.delete('openverse');
    }
    await pollStatus();
    if (saved?.snapshot?.keywords?.length) {
        active = Math.max(0, Number(saved.snapshot.readPos) || 0);
        setOrientationButtons(saved.snapshot.orientation || '');
        queue.load(saved.snapshot.keywords, { orientation: saved.snapshot.orientation || '', saved: saved.snapshot });
        startPolling();
    }
}

/* ----------------------------------------------------------- provider status */

let pollTimer = null;
let polling = null;
/** Re-polls already made for a provider's resumeAt (one each, so a clock gap can't cause a flood). */
const repolledFor = new Set();

function pollStatus() {
    if (polling) return polling;
    polling = (async () => {
        try {
            const res = await fetch('/api/providers/status');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            budgets = await res.json();
        } catch (err) {
            console.error('[IMGverse/bulk] provider status failed:', err.message);
        }
        renderProviders();
        renderRunbar();
        for (const [name, b] of Object.entries(budgets)) {
            if (b.status === 'ok' && !disabledByUser.has(name) && queue.rows.some((r) => r.pending.includes(name))) {
                queue.topUp(name);
            }
        }
    })().finally(() => { polling = null; });
    return polling;
}

function hasWork() {
    return queue.rows.some((r, i) => r.state === 'loading' || r.pending.length || (r.state === 'queued' && !r.skipped && queue.inWindow(i)));
}

function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
        if (hasWork()) pollStatus();
    }, STATUS_POLL_MS);
}

/* ----------------------------------------------------------- interaction */

function setActive(i, scroll = true) {
    const rows = queue.rows;
    if (i < 0 || i >= rows.length) return;
    active = i;
    queue.setReadPos(Math.max(active, firstVisibleRow()));
    scheduleRender();
    if (scroll) {
        requestAnimationFrame(() => {
            els.rows.querySelector(`.krow[data-row="${i}"]`)?.scrollIntoView({
                block: 'center',
                behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
            });
        });
    }
}

function firstVisibleRow() {
    const toolbar = document.querySelector('.bulk-toolbar');
    const top = toolbar ? toolbar.getBoundingClientRect().bottom : 0;
    const el = [...els.rows.children].find((row) => row.getBoundingClientRect().bottom > top);
    return el ? Number(el.dataset.row) : 0;
}

function pick(i, j) {
    const row = queue.rows[i];
    if (!row || !row.images[j]) return;
    if (j >= shownFor(i, row)) shown.set(i, Math.ceil((j + 1) / PER_ROW) * PER_ROW);
    queue.pick(i, j);
    active = i;
}

function start() {
    const list = parseKeywords();
    if (!list.length) return;
    shown.clear();
    rowSig.clear();
    els.rows.replaceChildren();
    active = 0;
    failures = [];
    renderFailures();
    els.dlStatus.textContent = '';
    queue.load(list, { orientation: currentOrientation() });
    pollStatus();
    startPolling();
}

function currentOrientation() {
    return document.querySelector('#bulk-orient [aria-pressed="true"]')?.dataset.orient ?? 'landscape';
}

function setOrientationButtons(orient) {
    document.querySelectorAll('#bulk-orient button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.orient === orient)));
}

function updateKeywordCount() {
    const n = parseKeywords().length;
    els.kwCount.textContent = n > MAX_KEYWORDS ? `${n} (first ${MAX_KEYWORDS.toLocaleString()} used)` : String(n);
    els.run.textContent = n ? `Search ${Math.min(n, MAX_KEYWORDS)} keyword${n === 1 ? '' : 's'}` : 'Search keywords';
    els.run.disabled = !n;
}

/* ----------------------------------------------------------- downloads */

function renderFailures() {
    els.dlFails.replaceChildren(...failures.map((f) => {
        const li = document.createElement('li');
        li.textContent = formatBatchFailureLine(f);
        return li;
    }));
    els.dlFails.classList.toggle('hidden', !failures.length);
    els.retry.classList.toggle('hidden', !failures.length);
    els.retry.disabled = downloading;
    els.retry.textContent = `Retry ${failures.length} failed`;
}

async function runDownloads(list) {
    if (!list.length || downloading) return;
    downloading = true;
    renderMeta();
    const total = list.length;
    failures = await runDownloadQueue(list, {
        download:   (img, name) => downloadImage(img, name, size),
        onProgress: ({ index, name }) => { els.dlStatus.textContent = `Downloading ${index + 1} of ${total}: ${name}`; },
    });
    downloading = false;
    els.dlStatus.textContent = formatBatchFinishMessage(total - failures.length, failures);
    renderFailures();
    renderMeta();
}

/* ----------------------------------------------------------- wiring */

let initialised = false;

/** Wire the Bulk keywords tab. Safe to call once. */
export function initBulkMode() {
    if (initialised) return;
    initialised = true;

    els.keywords.addEventListener('input', () => { updateKeywordCount(); persist(); });
    els.run.addEventListener('click', start);

    els.providers.addEventListener('change', (e) => {
        const box = e.target.closest('input[data-provider]');
        if (!box) return;
        const name = box.dataset.provider;
        if (name === 'openverse') { if (box.checked) enabled.add('openverse'); else enabled.delete('openverse'); }
        else if (box.checked) disabledByUser.delete(name);
        else disabledByUser.add(name);
        // Switched off: stop waiting on it (no top-ups will spend its quota).
        if (!box.checked) queue.dropPending(name);
        persist();
    });

    document.querySelectorAll('#bulk-orient button').forEach((b) => b.addEventListener('click', () => {
        const orient = b.dataset.orient;
        if (orient === currentOrientation()) return;
        setOrientationButtons(orient);
        shown.clear();
        if (queue.rows.length) queue.setOrientation(orient);
    }));

    document.querySelectorAll('#bulk-size button').forEach((b) => b.addEventListener('click', () => {
        size = b.dataset.size;
        document.querySelectorAll('#bulk-size button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        persist();
    }));

    document.querySelectorAll('#bulk-filter button').forEach((b) => b.addEventListener('click', () => {
        filter = b.dataset.filter;
        document.querySelectorAll('#bulk-filter button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        scheduleRender();
    }));

    els.pause.addEventListener('click', () => (queue.paused ? queue.resume() : queue.pause()));
    els.download.addEventListener('click', () => {
        failures = [];
        renderFailures();
        runDownloads(queue.downloadList());
    });
    els.retry.addEventListener('click', () => runDownloads(failures.map(({ img, name }) => ({ img, name }))));

    els.rows.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        const rowEl = e.target.closest('.krow');
        if (!btn) {
            if (rowEl && !e.target.closest('input')) setActive(Number(rowEl.dataset.row), false);
            return;
        }
        const i = Number(btn.dataset.row);
        const act = btn.dataset.act;
        if (act === 'pick') pick(i, Number(btn.dataset.img));
        if (act === 'more') { shown.set(i, shownFor(i, queue.rows[i]) + PER_ROW); scheduleRender(); }
        if (act === 'skip') queue.toggleSkip(i);
        if (act === 'retry') queue.retry(i);
    });

    els.rows.addEventListener('submit', (e) => {
        const form = e.target.closest('form.query');
        if (!form) return;
        e.preventDefault();
        const i = Number(form.dataset.row);
        const input = form.querySelector('input');
        input.blur();
        shown.delete(i);
        queue.setQuery(i, input.value);
    });

    els.rows.addEventListener('input', (e) => {
        if (e.target.matches('.query input')) e.target.style.setProperty('--len', e.target.value.length);
    });

    document.addEventListener('keydown', (e) => {
        if ($('view-bulk').hidden || !queue.rows.length) return;
        if ((e.target instanceof Element && e.target.closest('input, textarea, select')) || e.metaKey || e.ctrlKey || e.altKey) return;
        const rows = queue.rows;
        const vis = rows.map((_, i) => i).filter((i) => visible(rows[i]));
        if (!vis.length) return;
        const pos = vis.indexOf(active);   // -1 when the active row is filtered out
        const row = rows[active];
        const key = e.key.toLowerCase();
        if (key === 'j' || key === 'arrowdown') { e.preventDefault(); setActive(vis[pos === -1 ? 0 : Math.min(vis.length - 1, pos + 1)]); }
        else if (key === 'k' || key === 'arrowup') { e.preventDefault(); setActive(vis[pos === -1 ? 0 : Math.max(0, pos - 1)]); }
        else if (/^[1-9]$/.test(key) && row) { pick(active, Number(key) - 1); }
        else if (key === 'arrowright' && row?.pick != null) { e.preventDefault(); pick(active, Math.min(row.images.length - 1, row.pick + 1)); }
        else if (key === 'arrowleft' && row?.pick != null) { e.preventDefault(); pick(active, Math.max(0, row.pick - 1)); }
        else if (key === 's' && row) { queue.toggleSkip(active); }
        else if (key === 'e' && row) {
            const input = els.rows.querySelector(`.krow[data-row="${active}"] .query input`);
            if (input) { e.preventDefault(); input.focus(); input.select(); }
        }
    });

    let scrollQueued = false;
    window.addEventListener('scroll', () => {
        if (scrollQueued || $('view-bulk').hidden || !queue.rows.length) return;
        scrollQueued = true;
        requestAnimationFrame(() => {
            scrollQueued = false;
            const pos = Math.max(active, firstVisibleRow());
            if (pos !== queue.readPos) queue.setReadPos(pos);
        });
    }, { passive: true });

    // Countdowns tick while something is paused.
    setInterval(() => {
        const anyPaused = queue.openverseResumeAt || Object.values(budgets).some((b) => b.status === 'paused');
        if (!anyPaused) return;
        renderProviders();
        renderRunbar();
        // When a provider's pause should be over, ask the server once for that resumeAt.
        for (const b of Object.values(budgets)) {
            if (b.status === 'paused' && b.resumeAt && Date.parse(b.resumeAt) <= Date.now() && !repolledFor.has(b.resumeAt)) {
                repolledFor.add(b.resumeAt);
                pollStatus();
                break;
            }
        }
    }, 1000);

    window.addEventListener('pagehide', () => {
        clearTimeout(persistTimer);
        persistTimer = null;
        writeState();
    });

    restore().then(() => {
        updateKeywordCount();
        document.querySelectorAll('#bulk-size button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.size === size)));
        scheduleRender();
    });
}
