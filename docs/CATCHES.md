# Deploy Gate — Dry-Run Catches

Ship gate per `trust-layer/PLAN.md`: the gate had to catch real historical bug
classes in dry-run before v1 could ship. Each catch below reproduces the actual
failure pattern as a fixture under `test/fixtures/` and is asserted by
`test/test.js`. **Result: 4/4 bug classes caught. The gate ships.**

All fixtures verified 2026-09-18. Test command: `node test/test.js` (21 tests,
zero dependencies).

---

## Catch 1 — inline-module scope: the DISTRICT_BEACONS ReferenceError

- **Real incident:** gear-ledger deploy, 2026-09-17. `DISTRICT_BEACONS` was
  declared with `const` inside the `forms.json` fetch `.then()` callback but
  referenced at module top level in the PRIME `anims` loop →
  `ReferenceError: Can't find variable: DISTRICT_BEACONS` killed boot before
  the first frame, so the loader never dismissed. Black's phone screenshot
  caught it via the build-error overlay. Import/export checks, HTTP 200s, and
  all 141 unit tests passed — the bug was invisible to every one of them
  because no test evaluated the page's inline module script.
- **Fixture:** `test/fixtures/scope/bug.js` — faithful reproduction of the
  pattern (const-in-`.then()`-callback + references in the top-level anims
  loop and a top-level call).
- **Gate behavior:** the scope check tracks scope *identity* (parent-linked
  scopes, not bare brace depth) and flags any reference from a scope where
  none of the identifier's declarations is visible. Dry-run: **2 findings**
  (`bug.js:18` in-loop reference, `bug.js:20` top-level reference), both
  naming `DISTRICT_BEACONS`.
- **Clean counterpart:** `test/fixtures/scope/clean.js` — same shape with the
  declaration hoisted to module scope → **0 findings**.

## Catch 2 — SAMPLE/LIVE label audit: the hardcoded build-time badge

- **Real incident:** 3D world, 2026-09-18. The GEAR LEDGER billboard's `SAMPLE`
  badge and the music ticker's `SIM` tag were hardcoded at scene build and
  never followed the WorldClient mode — so live mode still showed `SAMPLE`
  everywhere. Fixed by re-baking billboard textures on the live-upgrade hooks
  (`SAMPLE` amber ↔ `LIVE` green). Standing rule from the incident: every
  SAMPLE/LIVE label must read the mode, never a build-time constant.
- **Fixtures:** `test/fixtures/labels/bug.html` (static `<span class="badge">SAMPLE</span>`
  + `document.title = "LIVE"` + hardcoded ticker string),
  `test/fixtures/labels/bug.js` (build-time `textContent = 'SAMPLE'`).
- **Gate behavior:** flags whole-word uppercase `SAMPLE`/`LIVE` literals with
  no mode variable in the statement. Dry-run: **4 findings** across the two
  bug fixtures. Mode-driven forms all pass: `MODE === 'live' ? 'LIVE' : 'SAMPLE'`,
  the `{ live: 'LIVE', sample: 'SAMPLE' }` mode-keyed map, and
  `LABELS[MODE]` (`test/fixtures/labels/clean.js` → **0 findings**); data
  bindings (`{{ }}`, `data-bind`) are not flagged.

## Catch 3 — importer/module cache-bust versioning: the Pages split-brain

- **Real incident:** gear-ledger Pages deploy, 2026-09-17. Shipping a new
  `index.html` + a new `stage-logic.js` together broke the world on Black's
  phone — the browser fetched the new HTML (importing `proceduralForm`) but
  served the OLD cached `stage-logic.js` (no such export) → "Importing binding
  name 'proceduralForm' is not found" on the build-error overlay. Standing
  rule from the incident: any deploy that changes both an importer and its
  module must bump the import query string (`./stage-logic.js?v=YYYYMMDD`).
- **Fixtures:** `test/fixtures/versioning/` — `index-bug.html` imports
  `./stage-logic.js` (no query) and `./stable.js`; `index-clean.html` imports
  `./stage-logic.js?v=20260918`; changed set = both HTML files + `stage-logic.js`.
- **Gate behavior:** resolves each changed importer's relative module URLs to
  repo paths and flags when the target module is *also* changed without a
  version query. Dry-run: **exactly 1 finding** (`index-bug.html` →
  `stage-logic.js`); the versioned import passes and the unchanged `stable.js`
  correctly needs no bump.

## Catch 4 — secret scan: secret-shaped values never ship

- **Real incident class:** preventive — encodes the standing security order
  (2026-09-15) that all CWI data is encrypted at rest and secrets never ship
  in deploy trees.
- **Fixtures:** `test/fixtures/secret-scan/leak.txt` (fake `api_key`,
  `DB_PASSWORD`, `stripe_token` assignments + a fake RSA private-key block),
  `test/fixtures/secret-scan/notes.key` (secret-shaped filename).
  **All values are obviously fake** (`sk-test-FAKE-0000`,
  `hunter2-fake-notreal`, `tok_test_FAKE_1234`, `MIIFakeNotARealKeyMaterial…`);
  the gate flags the *shape* — it cannot and does not distinguish fake from
  real, which is the safe direction.
- **Gate behavior:** filename rules + `*KEY`/`*TOKEN`/`*SECRET*`/`*PASSWORD*`/
  `*CREDENTIAL*` assignment rules + private-key-block rule. Dry-run:
  **5 findings** (3 assignments, 1 key block, 1 filename). A dedicated test
  asserts the CLI output never contains any fixture value — findings name
  file, line, and key shape only. `clean.txt` (placeholders, empty values,
  non-secret assignments) → **0 findings**.

---

## Kill-rule verdict

PLAN.md kill rule: *catches zero real historical bug classes in dry-run before
v1 → do not ship.* The gate caught **4 of 4** reproduced classes, each tied to
a dated CWI incident above. **Verdict: SHIP.**
