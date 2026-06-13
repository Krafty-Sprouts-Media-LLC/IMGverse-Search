/* =============================================================================
 * app.js
 * IMGverse Search — Vanilla JS frontend.
 * Handles: search form, provider filter chips, orientation filter chips,
 * masonry grid rendering, right-click/open-in-tab flow via proxied URLs,
 * infinite scroll.
 *
 * @package IMGverse-Search
 * @since   1.0.0
 * ============================================================================= */

'use strict';

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------
const searchForm    = document.getElementById('search-form');
const searchInput   = document.getElementById('search-input');
const grid          = document.getElementById('grid');
const loader        = document.getElementById('loader');
const emptyState    = document.getElementById('empty-state');
const sentinel      = document.getElementById('sentinel');
const filterPills   = document.querySelectorAll('.filter-pill');
const orientPills   = document.querySelectorAll('.orient-pill');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentQuery       = '';
let currentPage        = 1;
let currentProvider    = '';
let currentOrientation = '';   // '' | 'landscape' | 'portrait' | 'square'
let isLoading          = false;
let hasMore            = true;

// ---------------------------------------------------------------------------
// Search form submit
// ---------------------------------------------------------------------------
searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (!q) return;
    startNewSearch(q);
});

// ---------------------------------------------------------------------------
// Provider filter pills
// ---------------------------------------------------------------------------
filterPills.forEach((pill) => {
    pill.addEventListener('click', () => {
        filterPills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        currentProvider = pill.dataset.provider || '';
        if (currentQuery) startNewSearch(currentQuery);
    });
});

// ---------------------------------------------------------------------------
// Orientation filter pills
// ---------------------------------------------------------------------------
orientPills.forEach((pill) => {
    pill.addEventListener('click', () => {
        orientPills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        currentOrientation = pill.dataset.orientation || '';
        if (currentQuery) startNewSearch(currentQuery);
    });
});

// ---------------------------------------------------------------------------
// Start a fresh search (reset grid)
// ---------------------------------------------------------------------------
function startNewSearch(q) {
    currentQuery = q;
    currentPage  = 1;
    hasMore      = true;
    grid.innerHTML = '';
    emptyState.classList.add('hidden');
    fetchPage();
}

// ---------------------------------------------------------------------------
// Fetch one page of results from the backend
// ---------------------------------------------------------------------------
async function fetchPage() {
    if (isLoading || !hasMore) return;

    isLoading = true;
    loader.classList.remove('hidden');

    try {
        const params = new URLSearchParams({ q: currentQuery, page: currentPage });
        if (currentProvider)    params.set('providers',    currentProvider);
        if (currentOrientation) params.set('orientation',  currentOrientation);

        const res  = await fetch(`/api/search?${params}`);
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Search failed');

        if (data.results.length === 0) {
            hasMore = false;
            if (currentPage === 1) showEmptyState();
        } else {
            renderCards(data.results);
            currentPage++;
            if (data.results.length < 10) hasMore = false;
        }
    } catch (err) {
        console.error('[IMGverse]', err.message);
        if (currentPage === 1) showEmptyState();
    } finally {
        isLoading = false;
        loader.classList.add('hidden');
    }
}

// ---------------------------------------------------------------------------
// Render image cards into the masonry grid
// ---------------------------------------------------------------------------
function renderCards(results) {
    results.forEach((img) => {
        const figure = document.createElement('figure');
        figure.className = 'img-card';

        const aspectStyle = img.width && img.height
            ? `aspect-ratio: ${img.width} / ${img.height};`
            : '';

        figure.innerHTML = `
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
                        class="btn-open"
                        href="${escHtml(img.full)}"
                        target="_blank"
                        rel="noopener"
                        title="Open full-resolution image in a new tab — then right-click to Save As"
                    >
                        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                        Open full image
                    </a>
                </div>
            </div>
        `;

        grid.appendChild(figure);
    });
}

// ---------------------------------------------------------------------------
// Infinite scroll via IntersectionObserver
// ---------------------------------------------------------------------------
const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && currentQuery && hasMore && !isLoading) {
        fetchPage();
    }
}, { rootMargin: '400px' });

observer.observe(sentinel);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function showEmptyState() {
    emptyState.classList.remove('hidden');
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
