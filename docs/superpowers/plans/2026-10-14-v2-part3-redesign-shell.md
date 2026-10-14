# v2.0.0 Part 3: Redesigned Shell and Search Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved look (prototype `demo-bulk-keywords.html`): a top bar with **Search** / **Bulk keywords** tabs, a left sidebar + main layout, and the restyled Search tab — and fix the two Search bugs recorded in the parity checklist.

**Architecture:** `index.html` is restructured into a shell (top bar + tab panels). The Search panel keeps **every id and class that `search-mode.js` uses** (the JS contract below), so behaviour is untouched except the two bug fixes. A new `shell.js` owns tabs (URL hash `#search` / `#bulk`, ARIA tabs, arrow keys). `style.css` is rewritten with design tokens from the prototype. The Bulk panel is an empty placeholder until Part 4.

**Tech Stack:** Static HTML/CSS, vanilla ES modules, `node:test` for pure helpers. Fonts: Plus Jakarta Sans (existing) + JetBrains Mono, both from Google Fonts.

**Spec:** [`docs/superpowers/specs/2026-10-14-sise-bulk-keywords-design.md`](../specs/2026-10-14-sise-bulk-keywords-design.md) §6, §8, §11 step 4. Parity checklist: [`docs/sise-redesign-parity.md`](../../sise-redesign-parity.md).

## Global Constraints

- **JS contract (must survive the markup change):** ids `search-form search-input grid loader empty-state pagination page-prev page-next page-label page-count batch-toggle batch-body batch-filenames batch-filename-count batch-selection-count batch-remaining-count batch-mode batch-clear batch-download batch-retry batch-status batch-failures`; classes `filter-pill` (with `data-provider`) and `orient-pill` (with `data-orientation`) toggled via `.active`; radio inputs `name="batch-size"` values `web`/`full`; `#empty-state` contains an `h2` and a `p`; JS-generated classes `img-card img-card--opened img-card--batch-selected opened-pin batch-order batch-filename-preview card-overlay card-top card-bottom provider-badge card-credit btn-open btn-open--opened grid--batch-mode grid--batch-full hidden`.
- Visual design (spec §8): light only (the app has never had dark mode); tokens on `:root` in OKLCH; brand `#FF3366` ≈ `oklch(0.60 0.215 12)` used only for primary actions, selection and current state — no gradients, no gradient text, no side-stripe borders, card radius ≤ 12px, no border + wide-shadow "ghost cards"; Plus Jakarta Sans for UI, JetBrains Mono for queries/filenames/sizes; motion 150–250 ms state changes only, `prefers-reduced-motion` respected; layout collapses to one column under 860px with no horizontal page scroll; body text contrast ≥ 4.5:1.
- No emoji in UI (the card credit's 📷 becomes plain "Photo by …").
- Cache-busting: changed/new modules `?v=2.0.0`; `style.css?v=2.0.0`.
- New files `@since 2.0.0`; never change existing `@since`. Log prefix `[IMGverse/...]`.
- Commits on `release/v2.0.0`; no push/tag/merge.
- Ruling (planning): the CSS and markup are authored during implementation against the prototype rather than pasted into this plan — visual work is verified by screenshots at 1280px and 375px plus the parity walk, which is stronger evidence for layout than plan text. Pure logic (tabs) is specified and unit-tested here.
- Ruling (planning): the two Search bugs live in DOM code with no DOM test harness in the repo; each is reproduced in the browser first (RED) and re-checked after the fix (GREEN), recorded in the ledger.

## Review Focus

1. **Deep link `/#bulk`, then reload** → Bulk tab selected; back to `#search` via the tab or the browser Back button. Unit test (hash parsing) + browser check in Task 1.
2. **Pill clicked while a search is still loading** → the newest request's results show; loader hides only when the newest request finishes. Browser RED/GREEN in Task 3.
3. **Reload, then re-run the same term** → restored batch queue is kept (not wiped). Browser RED/GREEN in Task 3.
4. **375px phone width** → no horizontal page scroll; sidebar stacks above results; tabs still reachable. Screenshot in Task 2.
5. **Keyboard only** → tabs reachable with Tab, switch with ←/→, visible focus ring on pills/buttons/cards' Open link. Browser check in Task 2.

---

### Task 1: Tabs (`shell.js`)

**Files:**
- Create: `app/public/shell.js`, `app/src/lib/shell.test.js`
- Modify: `app/public/app.js` (call `initShell()` before `initSearchMode()`)

**Interfaces:**
- Produces: `TABS = ['search', 'bulk']`; `tabFromHash(hash: string) → 'search' | 'bulk'` (unknown/empty → `'search'`); `initShell({ doc?, win? }) → { show(tab) }` — selects the tab whose button has `data-tab=<name>` (role `tab`, `aria-controls` = panel id), sets `aria-selected`, `tabindex` (0 on selected, -1 otherwise), toggles `hidden` on panels, writes `#<tab>` to the URL with `history.replaceState` when a tab is clicked, follows `hashchange`, and moves between tabs with ArrowLeft/ArrowRight/Home/End.

- [ ] **Step 1: Write the failing test** — `app/src/lib/shell.test.js`:

```js
// =============================================================================
// src/lib/shell.test.js
// IMGverse Search — Tests for tab routing helpers.
//
// @package IMGverse-Search
// @since   2.0.0
// =============================================================================

'use strict';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TABS, tabFromHash } from '../../public/shell.js';

describe('tabFromHash', () => {
  it('knows both tabs', () => {
    assert.deepEqual(TABS, ['search', 'bulk']);
  });
  it('reads the tab from the URL hash', () => {
    assert.equal(tabFromHash('#bulk'), 'bulk');
    assert.equal(tabFromHash('#search'), 'search');
    assert.equal(tabFromHash('#BULK'), 'bulk');
  });
  it('falls back to search for empty or unknown hashes', () => {
    assert.equal(tabFromHash(''), 'search');
    assert.equal(tabFromHash('#'), 'search');
    assert.equal(tabFromHash('#settings'), 'search');
    assert.equal(tabFromHash(undefined), 'search');
  });
});
```

- [ ] **Step 2: Run** `cd app && npm test` → FAIL (module not found).
- [ ] **Step 3: Implement** `app/public/shell.js`:

```js
/**
 * App shell: Search / Bulk keywords tabs with URL-hash routing.
 *
 * @package IMGverse-Search
 * @since   2.0.0
 */

'use strict';

export const TABS = ['search', 'bulk'];

/**
 * @param {string} [hash] e.g. '#bulk'
 * @returns {'search'|'bulk'}
 */
export function tabFromHash(hash) {
  const name = String(hash || '').replace(/^#/, '').toLowerCase();
  return TABS.includes(name) ? name : 'search';
}

/**
 * Wire the tab buttons ([role="tab"][data-tab]) and their panels.
 *
 * @param {object} [env]
 * @param {Document} [env.doc]
 * @param {Window}   [env.win]
 * @returns {{ show: (tab: string) => void }}
 */
export function initShell({ doc = globalThis.document, win = globalThis.window } = {}) {
  const tabs = [...doc.querySelectorAll('[role="tab"][data-tab]')];

  function show(name) {
    const tab = TABS.includes(name) ? name : 'search';
    for (const btn of tabs) {
      const selected = btn.dataset.tab === tab;
      btn.setAttribute('aria-selected', String(selected));
      btn.tabIndex = selected ? 0 : -1;
      doc.getElementById(btn.getAttribute('aria-controls'))?.toggleAttribute('hidden', !selected);
    }
  }

  tabs.forEach((btn, i) => {
    btn.addEventListener('click', () => {
      show(btn.dataset.tab);
      win.history.replaceState(null, '', `#${btn.dataset.tab}`);
    });
    btn.addEventListener('keydown', (e) => {
      const last = tabs.length - 1;
      const next = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      tabs[next].focus();
      tabs[next].click();
    });
  });

  win.addEventListener('hashchange', () => show(tabFromHash(win.location.hash)));
  show(tabFromHash(win.location.hash));
  return { show };
}
```

- [ ] **Step 4: Run** `cd app && npm test` → PASS, 91 tests.
- [ ] **Step 5:** In `app/public/app.js` import `{ initShell } from './shell.js?v=2.0.0'` and call `initShell();` before `initSearchMode();`. Commit with Task 2 (the tab markup lands there).

---

### Task 2: Shell markup + restyle (`index.html`, `style.css`)

**Files:** Modify `app/public/index.html`, rewrite `app/public/style.css`, modify `app/public/search-mode.js` (card credit text only; pills' `aria-pressed`).

- [ ] **Step 1: Markup.** Restructure `index.html` into: `<header class="topbar">` (logo + `<nav role="tablist">` with `<button role="tab" data-tab="search" id="tab-search" aria-controls="view-search">Search</button>` and the same for `bulk` → `view-bulk`); `<div class="view" id="view-search" role="tabpanel" aria-labelledby="tab-search">` containing `<aside class="sidebar">` (the whole batch panel, all contract ids, toggle button kept as the section header, panel **expanded by default** with `aria-expanded="true"`) and `<main class="main">` (search form, provider pills, orientation pills, `#empty-state`, `#grid`, `#loader`, `#pagination`); `<div class="view" id="view-bulk" role="tabpanel" aria-labelledby="tab-bulk" hidden>` with a placeholder empty state ("Bulk keywords — coming in this release"). Keep the existing `<title>` and meta description (rename is Part 5). Load `style.css?v=2.0.0`, `app.js?v=2.0.0`, and add JetBrains Mono to the Google Fonts URL.
- [ ] **Step 2: Styles.** Rewrite `style.css` to the prototype's look under the Global Constraints: tokens (`--bg --panel --surface --ink --ink-2 --muted --line --line-2 --brand --brand-ink --brand-bg --warn --warn-bg --ok --ok-bg --mono --r --ease` and a z-index scale), top bar + segmented tabs, sticky sidebar (320px) / main grid layout, pills (`.active` = selected), masonry grid via CSS columns, card overlay on hover/focus-within, Opened pin, batch order badge + filename preview (mono), dimming for `.grid--batch-full`, pointer cursor in `.grid--batch-mode`, pager, loader, empty state, `.hidden { display:none !important }`, focus-visible rings, reduced-motion block, `@media (max-width: 860px)` single column.
- [ ] **Step 3: Small JS touches in `search-mode.js`.** Card credit: replace the `📷` emoji with the text `Photo by ` (inside `.card-credit`). Pills: wherever `.active` is added/removed, also set `aria-pressed` (`'true'`/`'false'`), and add `aria-pressed` to the pill markup in `index.html` (`true` on the default "All Providers" and "Any").
- [ ] **Step 4: Verify** — `npm test` (91 pass); syntax-check changed modules; screenshots at 1280×800 and 375×812 of: empty Search tab, results, batch mode with 2 selections, Bulk placeholder; `document.documentElement.scrollWidth === innerWidth` at 375px; keyboard: Tab to tabs, ←/→ switches, focus ring visible on a pill and on a card's Open link; `/#bulk` + reload opens Bulk; Back returns to Search.
- [ ] **Step 5: Parity walk** — repeat the Part 2 browser parity steps (search, Openverse pill = 0 `/api/search` calls, portrait filter, paging, Opened pin, batch counters/cap/badges/preview/dim, page change keeps selections, intercepted download names, reload restore, new term clears). Ledger the results.
- [ ] **Step 6: Commit** `feat: redesigned shell with Search and Bulk keywords tabs`.

---

### Task 3: Fix the two Search bugs

**Files:** Modify `app/public/search-mode.js`, `docs/sise-redesign-parity.md` (tick both).

- [ ] **Step 1: RED (browser).** (a) Search `heron`, then click the Openverse pill within ~300 ms (before the loader hides) → grid ends empty. (b) Fill 2 filenames, select 2 images, reload, search `heron` again → selections wiped. Record both in the ledger.
- [ ] **Step 2: Fix (a)** in `fetchPage()`: change the guard to `if (!currentQuery) return;` (drop `isLoading ||`), keep the `token !== searchToken` stale check, and in `finally` only clear loading when the request is still current:

```js
    } finally {
        if (token === searchToken) {
            isLoading = false;
            loader.classList.add('hidden');
        }
    }
```

- [ ] **Step 3: Fix (b)** in `loadBatchState()`: restore the query the queue belongs to, so re-running it is not treated as a new term:

```js
    const savedQuery = storageGet(BATCH_QUERY_KEY);
    if (savedQuery && batchSelections.length) {
        currentQuery = savedQuery;
        searchInput.value = savedQuery;
    }
```

(Only when selections exist — an empty queue has nothing to protect, and the box stays empty as before.)

- [ ] **Step 4: GREEN (browser).** Repeat both reproductions: (a) Openverse-only results appear and the loader hides; (b) selections survive the re-search; a *different* term still clears them. `npm test` 91 pass.
- [ ] **Step 5:** Tick both items in `docs/sise-redesign-parity.md`. Commit `fix: newest search wins when filters change mid-load; keep restored batch on same-term search`.
