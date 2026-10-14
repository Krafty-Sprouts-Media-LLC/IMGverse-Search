# v2.0.0 Part 5: SISE Rename and Release Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the product to **SISE** ("Stock image search engine") without losing users' saved browser state or breaking the live deployment, and prepare the `v2.0.0` release (changelog, version, verification). Merge, tag, push and redeploy happen only when the user says so.

**Spec:** [`docs/superpowers/specs/2026-10-14-sise-bulk-keywords-design.md`](../specs/2026-10-14-sise-bulk-keywords-design.md) §9, §11 step 6–7.

## Global Constraints

- Rename: UI name and `<title>`/meta description, header tagline "Stock image search engine", `app/package.json` name `sise`, `meta.json` `name` + `version 2.0.0`, README, AGENTS.md (log prefix rule `[SISE/...]`), file headers (`@package SISE`, `IMGverse Search —` → `SISE —`; existing `@since` untouched), log prefixes `[IMGverse/...]`/`[IMGverse]` → `[SISE/...]`/`[SISE]` (tests that assert prefixes updated), Redis search-cache prefix `imgverse:search` → `sise:search`, provider `User-Agent` `IMGverse-Search/1.0` → `SISE/2.0`, release workflow title `SISE <tag>`.
- Session storage keys `imgverse:*` → `sise:*`, migrated once on load (old value moved, old key removed, an existing new key never overwritten).
- **Kept unchanged (ruling — deployment wiring the user owns):** GHCR image names `ghcr.io/<owner>/imgverse-search` (Dokploy pulls them), Redis volume name default `imgverse_redis_data` and `.env.example` `STACK_SLUG=imgverse` (renaming points production at a new empty volume), `meta.json` `id` and GitHub URLs (change after the user renames the repo). Listed as manual steps in the CHANGELOG.
- CHANGELOG `[2.0.0] - 14/10/2026` describing everything in Parts 1–5, including the deferred-minor behaviour notes (log prefix changes, download size read once per run).
- Commits on `release/v2.0.0`; **no merge/tag/push/redeploy** without the user.

## Review Focus

1. A user with an in-progress batch / Opened marks / bulk run from v1.0.36 upgrades → everything is still there after the first v2 load. Unit test (migration) + browser check.
2. A user who already has `sise:` data (reload after upgrade) → never overwritten by stale `imgverse:` data. Unit test.
3. No `[IMGverse` log prefix left in app code; no `imgverse:` storage/cache key left except inside the migration.

---

### Task 1: Storage key migration

**Files:** `app/public/safe-storage.js`, `app/src/lib/safe-storage.test.js`, `app/public/app.js`.

- [ ] Failing tests for `migrateKeys(fromPrefix, toPrefix, storage?) → number` (moves, removes old, skips when the new key exists, survives blocked storage).
- [ ] Implement; call `migrateKeys('imgverse:', 'sise:')` in `app.js` before the tabs initialise.
- [ ] Rename the keys in `search-mode.js` and `bulk-mode.js` (`sise:opened`, `sise:saved`, `sise:batch-*`, `sise:bulk`).

### Task 2: Rename everything else

- [ ] Apply the Global Constraints rename across app code, tests, docs, workflows, Dockerfiles, nginx files, smoke test; keep the ruled exceptions.
- [ ] `grep` checks: no `[IMGverse` in `app/`; `imgverse:` only in the migration call; suite green.

### Task 3: Release prep

- [ ] CHANGELOG `[2.0.0]`, `meta.json` 2.0.0, cache-busting suffixes all consistent.
- [ ] Verify: `npm test`, browser walk of both tabs (title/branding, migration from seeded `imgverse:` keys), Docker smoke from a space-free copy (known script issues tracked in GitHub issue #1).
- [ ] Commit `release: v2.0.0 — Bulk keywords, redesign and SISE rename`. Stop and ask the user before merge/tag/push/redeploy.
