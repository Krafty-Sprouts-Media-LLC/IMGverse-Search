/**
 * Throw-proof sessionStorage access.
 *
 * Storage can throw on read, write or even on touching the
 * `sessionStorage` property (private mode, blocked site data, quota
 * exceeded, data: URLs). The UI must keep working without it, so every
 * call here returns a safe value and logs the first failure once.
 *
 * @package IMGverse-Search
 * @since   1.0.36
 */

'use strict';

let warned = false;

function warnOnce(action, key, err) {
  if (warned) return;
  warned = true;
  console.warn(
    `[IMGverse/storage] ${action} "${key}" failed; batch selections and Opened marks will not survive a reload:`,
    err?.message || err
  );
}

function resolve(storage) {
  if (storage) return storage;
  try {
    return globalThis.sessionStorage || null;
  } catch (err) {
    warnOnce('access', 'sessionStorage', err);
    return null;
  }
}

/**
 * @param {string} key
 * @param {Storage|null} [storage]
 * @returns {string|null}
 */
export function storageGet(key, storage) {
  const s = resolve(storage);
  if (!s) return null;
  try {
    return s.getItem(key);
  } catch (err) {
    warnOnce('read', key, err);
    return null;
  }
}

/**
 * @param {string} key
 * @param {string} value
 * @param {Storage|null} [storage]
 * @returns {boolean} Whether the value was stored.
 */
export function storageSet(key, value, storage) {
  const s = resolve(storage);
  if (!s) return false;
  try {
    s.setItem(key, value);
    return true;
  } catch (err) {
    warnOnce('write', key, err);
    return false;
  }
}

/**
 * @param {string} key
 * @param {Storage|null} [storage]
 * @returns {boolean} Whether the key was removed.
 */
export function storageRemove(key, storage) {
  const s = resolve(storage);
  if (!s) return false;
  try {
    s.removeItem(key);
    return true;
  } catch (err) {
    warnOnce('remove', key, err);
    return false;
  }
}

/**
 * Read and parse JSON, returning `fallback` when missing, blocked or invalid.
 *
 * @param {string} key
 * @param {*} fallback
 * @param {Storage|null} [storage]
 * @returns {*}
 */
export function storageGetJSON(key, fallback, storage) {
  const raw = storageGet(key, storage);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Move every `fromPrefix` key to `toPrefix` (e.g. after a product rename),
 * removing the old key. Data already saved under the new prefix wins.
 *
 * @param {string} fromPrefix
 * @param {string} toPrefix
 * @param {Storage|null} [storage]
 * @returns {number} How many keys were moved.
 */
export function migrateKeys(fromPrefix, toPrefix, storage) {
  const s = resolve(storage);
  if (!s) return 0;
  let moved = 0;
  try {
    const oldKeys = [];
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i);
      if (key && key.startsWith(fromPrefix)) oldKeys.push(key);
    }
    for (const oldKey of oldKeys) {
      const newKey = toPrefix + oldKey.slice(fromPrefix.length);
      if (s.getItem(newKey) == null) {
        s.setItem(newKey, s.getItem(oldKey));
        moved++;
      }
      s.removeItem(oldKey);
    }
  } catch (err) {
    warnOnce('migrate', fromPrefix, err);
  }
  return moved;
}
