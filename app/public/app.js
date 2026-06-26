/* =============================================================================
 * app.js
 * IMGverse Search — Vanilla JS frontend.
 * Search, provider/orientation filters, paginated masonry grid.
 *
 * @package IMGverse-Search
 * @since   1.0.0
 * ============================================================================= */

'use strict';

const searchForm    = document.getElementById('search-form');
const searchInput   = document.getElementById('search-input');
const grid          = document.getElementById('grid');
const loader        = document.getElementById('loader');
const emptyState    = document.getElementById('empty-state');
const pagination    = document.getElementById('pagination');
const pagePrev      = document.getElementById('page-prev');
const pageNext      = document.getElementById('page-next');
const pageLabel     = document.getElementById('page-label');
const pageCount     = document.getElementById('page-count');
const filterPills   = document.querySelectorAll('.filter-pill');
const orientPills   = document.querySelectorAll('.orient-pill');
const batchToggle      = document.getElementById('batch-toggle');
const batchBody        = document.getElementById('batch-body');
const batchFilenames   = document.getElementById('batch-filenames');
const batchFilenameCount = document.getElementById('batch-filename-count');
const batchSelectionCount = document.getElementById('batch-selection-count');
const batchModeInput   = document.getElementById('batch-mode');
const batchClearBtn    = document.getElementById('batch-clear');
const batchDownloadBtn = document.getElementById('batch-download');
const batchStatus      = document.getElementById('batch-status');

let currentQuery       = '';
let currentPage        = 1;
let currentProvider    = '';
let currentOrientation = '';
let hasNextPage        = false;
let isLoading          = false;
let searchToken        = 0;
let batchMode          = false;
let batchDownloading   = false;
/** @type {object[]} */
let batchSelections    = [];

const OPENED_STORAGE_KEY = 'imgverse:opened';
const LEGACY_SAVED_STORAGE_KEY = 'imgverse:saved';

/** @returns {Set<string>} */
function loadOpenedKeys() {
    try {
        let raw = sessionStorage.getItem(OPENED_STORAGE_KEY);
        if (!raw) {
            raw = sessionStorage.getItem(LEGACY_SAVED_STORAGE_KEY);
            if (raw) {
                sessionStorage.setItem(OPENED_STORAGE_KEY, raw);
                sessionStorage.removeItem(LEGACY_SAVED_STORAGE_KEY);
            }
        }
        return new Set(raw ? JSON.parse(raw) : []);
    } catch {
        return new Set();
    }
}

/** @param {Set<string>} keys */
function persistOpenedKeys(keys) {
    sessionStorage.setItem(OPENED_STORAGE_KEY, JSON.stringify([...keys]));
}

/** Stable key for the same image across pages (matches server dedupe logic). */
function imageKey(img) {
    const raw = img.full || img.thumb || '';
    try {
        const parsed = new URL(raw);
        return `${parsed.hostname}${parsed.pathname}`.toLowerCase();
    } catch {
        return img.id || '';
    }
}

function isImageOpened(img) {
    const keys = loadOpenedKeys();
    const key  = imageKey(img);
    return Boolean(key && (keys.has(key) || keys.has(img.id)));
}

function markImageOpened(img) {
    const key = imageKey(img);
    if (!key) return;

    const keys = loadOpenedKeys();
    keys.add(key);
    if (img.id) keys.add(img.id);
    persistOpenedKeys(keys);
}

function applyOpenedState(figure, img) {
    figure.classList.add('img-card--opened');
    figure.setAttribute('aria-label', `${img.alt || 'Image'} — opened this session`);

    let pin = figure.querySelector('.opened-pin');
    if (!pin) {
        pin = document.createElement('span');
        pin.className = 'opened-pin';
        pin.textContent = 'Opened';
        figure.insertBefore(pin, figure.firstChild);
    }

    const btn = figure.querySelector('.btn-open');
    if (btn) {
        btn.classList.add('btn-open--opened');
        btn.title = 'Already opened this session — click to open again';
        const svg = btn.querySelector('svg');
        btn.textContent = '';
        if (svg) btn.appendChild(svg);
        btn.append(' Opened');
    }
}

/** @param {string} text */
function parseFilenames(text) {
    return String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);
}

function getBatchOrder(img) {
    const key = imageKey(img);
    const idx = batchSelections.findIndex((s) => imageKey(s) === key);
    return idx >= 0 ? idx + 1 : 0;
}

function syncBatchCardUI(figure, img) {
    const order = getBatchOrder(img);
    let badge = figure.querySelector('.batch-order');
    let label = figure.querySelector('.batch-filename-preview');

    if (order === 0) {
        figure.classList.remove('img-card--batch-selected');
        badge?.remove();
        label?.remove();
        return;
    }

    figure.classList.add('img-card--batch-selected');

    if (!badge) {
        badge = document.createElement('span');
        badge.className = 'batch-order';
        figure.appendChild(badge);
    }
    badge.textContent = String(order);

    const filenames = parseFilenames(batchFilenames.value);
    const fname = filenames[order - 1] || '';

    if (fname) {
        if (!label) {
            label = document.createElement('span');
            label.className = 'batch-filename-preview';
            figure.appendChild(label);
        }
        label.textContent = fname;
    } else {
        label?.remove();
    }
}

function updateBatchPanel() {
    const filenames = parseFilenames(batchFilenames.value);
    const fileCount = filenames.length;
    const selCount  = batchSelections.length;
    const ready     = fileCount > 0 && fileCount === selCount;

    batchFilenameCount.textContent = `${fileCount} filename${fileCount === 1 ? '' : 's'}`;
    batchSelectionCount.textContent = `${selCount} image${selCount === 1 ? '' : 's'} selected`;
    batchDownloadBtn.disabled = batchDownloading || !ready;
    batchClearBtn.disabled = batchDownloading || selCount === 0;

    grid.querySelectorAll('.img-card').forEach((figure) => {
        const img = figure.__imgData;
        if (img) syncBatchCardUI(figure, img);
    });
}

function toggleBatchSelection(img) {
    const key = imageKey(img);
    const idx = batchSelections.findIndex((s) => imageKey(s) === key);

    if (idx >= 0) {
        batchSelections.splice(idx, 1);
    } else {
        batchSelections.push(img);
    }

    updateBatchPanel();
}

function clearBatchSelection() {
    batchSelections = [];
    batchStatus.textContent = '';
    updateBatchPanel();
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runBatchDownload() {
    const filenames = parseFilenames(batchFilenames.value);
    if (filenames.length !== batchSelections.length || filenames.length === 0) return;

    batchDownloading = true;
    batchDownloadBtn.textContent = 'Downloading…';
    updateBatchPanel();

    let failed = 0;
    const total = batchSelections.length;

    for (let i = 0; i < total; i++) {
        const img  = batchSelections[i];
        const name = filenames[i];
        batchStatus.textContent = `Downloading ${i + 1} of ${total}: ${name}`;

        try {
            const params = new URLSearchParams({ url: img.full, name });
            const res = await fetch(`/download?${params}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = blobUrl;
            anchor.download = `${name}.jpg`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(blobUrl);
        } catch (err) {
            failed++;
            console.error('[IMGverse/batch]', name, err.message);
        }

        if (i < total - 1) await sleep(700);
    }

    batchDownloading = false;
    batchDownloadBtn.textContent = 'Download queue';
    batchStatus.textContent = failed
        ? `Finished with ${failed} error${failed === 1 ? '' : 's'}. Check the console.`
        : `Downloaded ${total} file${total === 1 ? '' : 's'}.`;
    updateBatchPanel();
}

batchToggle.addEventListener('click', () => {
    const collapsed = batchBody.classList.toggle('hidden');
    batchToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
});

batchFilenames.addEventListener('input', updateBatchPanel);

batchModeInput.addEventListener('change', () => {
    batchMode = batchModeInput.checked;
    grid.classList.toggle('grid--batch-mode', batchMode);
    batchStatus.textContent = batchMode
        ? 'Batch mode on — click images in the order they should match your filenames.'
        : '';
});

batchClearBtn.addEventListener('click', clearBatchSelection);
batchDownloadBtn.addEventListener('click', runBatchDownload);

searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (!q) return;
    startNewSearch(q);
});

filterPills.forEach((pill) => {
    pill.addEventListener('click', () => {
        filterPills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        currentProvider = pill.dataset.provider || '';
        if (currentQuery) startNewSearch(currentQuery);
    });
});

orientPills.forEach((pill) => {
    pill.addEventListener('click', () => {
        orientPills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        currentOrientation = pill.dataset.orientation || '';
        if (currentQuery) startNewSearch(currentQuery);
    });
});

pagePrev.addEventListener('click', () => {
    if (currentPage <= 1 || isLoading) return;
    goToPage(currentPage - 1);
});

pageNext.addEventListener('click', () => {
    if (!hasNextPage || isLoading) return;
    goToPage(currentPage + 1);
});

function startNewSearch(q) {
    searchToken++;
    currentQuery = q;
    currentPage  = 1;
    goToPage(1);
}

function goToPage(page) {
    currentPage = page;
    grid.innerHTML = '';
    emptyState.classList.add('hidden');
    pagination.classList.add('hidden');
    fetchPage();
}

async function fetchPage() {
    if (isLoading || !currentQuery) return;

    const token = searchToken;
    isLoading   = true;
    loader.classList.remove('hidden');

    try {
        const params = new URLSearchParams({
            q:    currentQuery,
            page: String(currentPage),
        });
        if (currentProvider)    params.set('providers',   currentProvider);
        if (currentOrientation) params.set('orientation', currentOrientation);

        const res  = await fetch(`/api/search?${params}`);
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Search failed');
        if (token !== searchToken) return;

        hasNextPage = Boolean(data.hasNext);

        if (data.results.length === 0) {
            if (currentPage === 1) {
                showEmptyState();
            } else {
                hasNextPage = false;
                updatePagination();
            }
        } else {
            renderCards(data.results);
            updatePagination(data.total);
            pagination.classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch (err) {
        console.error('[IMGverse]', err.message);
        if (currentPage === 1) showEmptyState();
    } finally {
        isLoading = false;
        loader.classList.add('hidden');
    }
}

function updatePagination(totalOnPage) {
    pageLabel.textContent = `Page ${currentPage}`;
    pageCount.textContent = totalOnPage != null
        ? `${totalOnPage} image${totalOnPage === 1 ? '' : 's'} on this page`
        : '';
    pagePrev.disabled = currentPage <= 1;
    pageNext.disabled = !hasNextPage;
}

function renderCards(results) {
    results.forEach((img) => {
        const figure = document.createElement('figure');
        figure.className = 'img-card';
        const opened = isImageOpened(img);

        const aspectStyle = img.width && img.height
            ? `aspect-ratio: ${img.width} / ${img.height};`
            : '';

        figure.innerHTML = `
            ${opened ? '<span class="opened-pin">Opened</span>' : ''}
            <img
                src="${escHtml(img.thumb)}"
                alt="${escHtml(img.alt || '')}"
                loading="lazy"
                decoding="async"
                style="${aspectStyle}"
            >
            <div class="card-overlay" aria-hidden="true">
                <div class="card-top">
                    <span class="provider-badge">${escHtml(img.provider)}</span>
                </div>
                <div class="card-bottom">
                    ${img.credit ? `<p class="card-credit">📷 <a href="${escHtml(img.creditUrl)}" target="_blank" rel="noopener">${escHtml(img.credit)}</a></p>` : ''}
                    <a
                        class="btn-open${opened ? ' btn-open--opened' : ''}"
                        href="${escHtml(img.full)}"
                        target="_blank"
                        rel="noopener"
                        title="${opened ? 'Already opened this session — click to open again' : 'Open full-resolution image from the provider — right-click to Save As'}"
                    >
                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                        ${opened ? 'Opened' : 'Open full image'}
                    </a>
                </div>
            </div>
        `;

        if (opened) {
            figure.classList.add('img-card--opened');
            figure.setAttribute('aria-label', `${img.alt || 'Image'} — opened this session`);
        }

        figure.__imgData = img;
        syncBatchCardUI(figure, img);

        const openBtn = figure.querySelector('.btn-open');
        openBtn.addEventListener('click', () => {
            markImageOpened(img);
            applyOpenedState(figure, img);
        });

        figure.querySelector('img').addEventListener('contextmenu', () => {
            markImageOpened(img);
            applyOpenedState(figure, img);
        });

        figure.addEventListener('click', (e) => {
            if (!batchMode || batchDownloading) return;
            if (e.target.closest('a')) return;
            toggleBatchSelection(img);
        });

        grid.appendChild(figure);
    });
}

function showEmptyState() {
    emptyState.classList.remove('hidden');
    pagination.classList.add('hidden');
    emptyState.querySelector('h2').textContent = `No results for "${currentQuery}"`;
    emptyState.querySelector('p').textContent  = 'Try a different keyword or check that at least one provider is configured.';
}

function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
