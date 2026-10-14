/**
 * Keyword → image search query. Article keywords ("can you freeze cooked
 * salmon") contain question words that stock providers would match
 * literally; this keeps the subject ("cooked salmon"). Rule-based, no AI.
 *
 * @package IMGverse-Search
 * @since   2.0.0
 */

'use strict';

export const PREFIXES = [
  /^can (you|i|we) (re)?freeze /,
  /^how (to|do you|long can you) freeze /,
  /^is it (ok|safe) to freeze /,
  /^what (to serve|goes|to eat|sides go) with /,
  /^traditional /,
];

export const CUTS = [
  ' for ', ' without ', ' in the ', ' in its ', ' in a ', ' in ', ' with the ',
  ' with ', ' to drink', ' after ', ' from a ', ' made with ', ' on it', ' later',
];

export const FILLERS = /^(a |an |the |an unopened pack of |unopened |a whole |leftover |opened |homemade |pack of |\d+-day-old )/;

/**
 * @param {string} keyword
 * @returns {string} The search query (never empty for a non-empty keyword).
 */
export function cleanQuery(keyword) {
  const original = String(keyword || '').trim();
  let q = original.toLowerCase().replace(/\s+/g, ' ');

  for (const re of PREFIXES) q = q.replace(re, '');

  const padded = ` ${q} `;
  let cut = padded.length;
  for (const phrase of CUTS) {
    const i = padded.indexOf(phrase, 1);
    if (i > 0 && i < cut) cut = i;
  }
  q = padded.slice(0, cut).trim();

  let prev;
  do {
    prev = q;
    q = q.replace(FILLERS, '');
  } while (q !== prev);

  return q.trim() || original;
}
