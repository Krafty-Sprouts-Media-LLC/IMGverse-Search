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
