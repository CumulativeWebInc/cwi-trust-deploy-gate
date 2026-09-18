# CWI Deploy Gate

**Pre-flight checks that catch the bug classes unit tests miss.**

Every check in this gate is a scar CWI already paid for. Unit tests are green,
the deploy ships, and then boot dies on Black's phone — because the failure
class lived in the seam *between* the tests and the deploy: a scope the tests
never evaluated, a label hardcoded at build time, a cache split-brain between
two changed files, a secret committed by accident. This gate encodes those
scars as machine-checkable rules and runs before the deploy goes out.

- **Result:** deploys stop dying from bug classes the test suite cannot see.
- **Audience:** any team shipping web artifacts (CWI dogfoods it on every deploy first).
- **Mechanism:** a zero-dependency Node CLI (`node >= 18`) running four static
  checks over the deploy tree.
- **Measurement:** reproduced historical bug classes caught in dry-run (see
  [docs/CATCHES.md](docs/CATCHES.md)); gates run on every CWI deploy.
- **Kill rule:** catches zero real historical bug classes in dry-run before v1
  → do not ship. (It caught 4/4 — see CATCHES.md.)

## The four checks

| Check | Flag | The incident it encodes |
|---|---|---|
| `scope` | identifier referenced from a scope where none of its declarations is visible (scope-identity analysis, not just depth — sibling scopes distinguished; `var` hoisting and braceless bodies handled) | gear-ledger 2026-09-17: `DISTRICT_BEACONS` declared `const` inside a `.then()` callback, referenced at module top level → `ReferenceError` killed boot before the first frame |
| `labels` | literal `SAMPLE`/`LIVE` badge with no mode variable driving it | 3D world 2026-09-18: billboard `SAMPLE` badge and ticker `SIM` tag hardcoded at scene build, never followed the WorldClient mode |
| `versioning` | importer AND its module both changed, but the import URL carries no `?v=` query | Pages cache split-brain 2026-09-17: new `index.html` + new `stage-logic.js` shipped together; the browser served the OLD cached module against the new page |
| `secrets` | secret-shaped filenames (`.env`, `.pem`, `.key`, `id_rsa*`, `*secret*`, `*credential*`), secret-shaped `KEY/TOKEN/SECRET/PASSWORD/CREDENTIAL` assignments, private-key blocks | standing security order: encrypt all CWI data — secrets never ship (preventive) |

The secret scan **never prints values** — findings name the file, line, and key
shape only. Its test fixtures use obviously fake values (`sk-test-FAKE-0000`).

## Usage

```bash
# scan the current tree (all checks)
node bin/deploy-gate.js .

# only some checks, machine output for CI
node bin/deploy-gate.js --checks scope,labels,versioning --json ./dist

# versioning check against an explicit changed-file list (no git needed)
node bin/deploy-gate.js --checks versioning --changed index.html,stage-logic.js ./dist

# skip paths (globs)
node bin/deploy-gate.js --exclude 'test/fixtures/secret-scan/**,docs/**' .
```

Exit codes: `0` = clean, `1` = findings, `2` = usage/operational error.

Per-line suppression for intentional exceptions:

```js
billboard.textContent = 'SAMPLE'; // deploy-gate: allow — demo fixture
```

## Checks in detail

**scope** — masks strings/comments, tokenizes, and tracks scope *identity*
(parent-linked scopes, not bare brace depth). A reference is satisfied only by
a declaration in its own scope or an ancestor scope — the exact `ReferenceError`
semantics. Undeclared names are flagged only at module top level (deeper
unresolved names are usually globals from sibling scripts; flagging them all
would drown the signal).

**labels** — flags whole-word uppercase `SAMPLE`/`LIVE` literals in `.js`/`.html`
unless the same statement shows a mode variable (`mode`, `isLive`, `LIVE_MODE`,
`env`, `config`, …), selects between *both* labels (mode-keyed map/ternary),
or is a data binding (`{{ }}`, `${ }`, `data-bind`, …). Comments are ignored.

**versioning** — takes the changed-file set from `git diff --name-only <base>`
(default base `HEAD`) or `--changed a,b,c`; extracts relative module URLs from
each changed importer (`import`/`export … from`, dynamic `import()`,
`<script src>`, inline module scripts, `new Worker()`); resolves them to repo
paths; flags when the target module is *also* changed and the URL has no query
string. Fix: `import { boot } from './stage-logic.js?v=20260918'`.

**secrets** — filename rules plus line rules for `*KEY`/`*TOKEN`/`*SECRET*`/
`*PASSWORD*`/`*CREDENTIAL*` assignments and `-----BEGIN … PRIVATE KEY-----`
blocks. Empty values and obvious placeholders (`xxx`, `changeme`,
`your-key-here`) are skipped; everything else is flagged with the value
redacted.

## Tests

```bash
node test/test.js   # 19 tests, zero dependencies
```

The suite reproduces each historical incident as a fixture
(`test/fixtures/*/bug.*`), asserts the gate flags it, and asserts clean
fixtures pass. The dry-run results are documented in [docs/CATCHES.md](docs/CATCHES.md).

## Docs site

Live docs: https://cumulativewebinc.github.io/cwi-trust-deploy-gate/

## Author

Henry Pitts — known as Black Lansky — is the founder of Cumulative Web Inc and a systems architect working at the top of the technical track: he designs the systems, defines what "done" means, and verifies that it holds. His operating law is "verified or it didn't happen." He is building the trust layer underneath the AI-agent economy — the infrastructure that proves what agents build.
