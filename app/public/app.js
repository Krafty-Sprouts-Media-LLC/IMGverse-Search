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

let currentQuery       = '';
let currentPage        = 1;
let currentProvider    = '';
let currentOrientation = '';
let hasNextPage        = false;
let isLoading          = false;
let searchToken        = 0;

const SAVED_STORAGE_KEY = 'imgverse:saved';

/** @returns {Set<string>} */
function loadSavedKeys() {
    try {
        const raw = sessionStorage.getItem(SAVED_STORAGE_KEY);
        return new Set(raw ? JSON.parse(raw) : []);
    } catch {
        return new Set();
    }
}

/** @param {Set<string>} keys */
function persistSavedKeys(keys) {
    sessionStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify([...keys]));
}

/** Stable key for the same image across pages (matches server dedupe logic). */
function savedKey(img) {
    const raw = img.full || img.thumb || '';
    try {
        const parsed = new URL(raw);
        return `${parsed.hostname}${parsed.pathname}`.toLowerCase();
    } catch {
        return img.id || '';
    }
}

function isImageSaved(img) {
    const keys = loadSavedKeys();
    const key  = savedKey(img);
    return Boolean(key && (keys.has(key) || keys.has(img.id)));
}

function markImageSaved(img) {
    const key = savedKey(img);
    if (!key) return;

    const keys = loadSavedKeys();
    keys.add(key);
    if (img.id) keys.add(img.id);
    persistSavedKeys(keys);
}

function applySavedState(figure, img) {
    figure.classList.add('img-card--saved');
    figure.setAttribute('aria-label', `${img.alt || 'Image'} — saved this session`);

    let pin = figure.querySelector('.saved-pin');
    if (!pin) {
        pin = document.createElement('span');
        pin.className = 'saved-pin';
        pin.textContent = 'Saved';
        figure.insertBefore(pin, figure.firstChild);
    }

    const btn = figure.querySelector('.btn-open');
    if (btn) {
        btn.classList.add('btn-open--saved');
        btn.title = 'Already opened this session — click to open again';
        const svg = btn.querySelector('svg');
        btn.textContent = '';
        if (svg) btn.appendChild(svg);
        btn.append(' Saved');
    }
}

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
        const saved = isImageSaved(img);

        const aspectStyle = img.width && img.height
            ? `aspect-ratio: ${img.width} / ${img.height};`
            : '';

        figure.innerHTML = `
            ${saved ? '<span class="saved-pin">Saved</span>' : ''}
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
                        class="btn-open${saved ? ' btn-open--saved' : ''}"
                        href="${escHtml(img.full)}"
                        target="_blank"
                        rel="noopener"
                        title="${saved ? 'Already opened this session — click to open again' : 'Open full-resolution image from the provider — right-click to Save As'}"
                    >
                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                        ${saved ? 'Saved' : 'Open full image'}
                    </a>
                </div>
            </div>
        `;

        if (saved) {
            figure.classList.add('img-card--saved');
            figure.setAttribute('aria-label', `${img.alt || 'Image'} — saved this session`);
        }

        const openBtn = figure.querySelector('.btn-open');
        openBtn.addEventListener('click', () => {
            markImageSaved(img);
            applySavedState(figure, img);
        });

        figure.querySelector('img').addEventListener('contextmenu', () => {
            markImageSaved(img);
            applySavedState(figure, img);
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
