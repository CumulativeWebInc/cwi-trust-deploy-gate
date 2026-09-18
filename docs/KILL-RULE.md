# Deploy Gate — Kill Rule

**Product:** CWI Deploy Gate (trust-layer program, Phase 1, Wave 2, product #5).

## The kill rule

> Catches zero real historical bug classes in dry-run before v1 → do not ship.

## Why this rule

The gate's entire value proposition is that it catches the bug classes unit
tests miss. If it cannot demonstrate that on *reproduced historical
incidents* — failures CWI actually suffered, with dates and receipts — then it
is process theater, and process theater gets killed, not shipped. This is the
standing results-only bar: every process names its result, measures it, and
carries a numeric kill rule.

## How it was measured

Four historical bug classes were reproduced as fixtures under
`test/fixtures/` (see `docs/CATCHES.md` for the incident references):

1. Inline-module scope — the DISTRICT_BEACONS ReferenceError (2026-09-17)
2. SAMPLE/LIVE label audit — hardcoded build-time badges (2026-09-18)
3. Importer/module cache-bust versioning — Pages split-brain (2026-09-17)
4. Secret scan — standing security order (preventive)

Each class has a bug fixture (must be flagged) and a clean fixture (must
pass), asserted by `test/test.js`.

## Verdict

**4/4 bug classes caught in dry-run on 2026-09-18. The gate ships.**

## Standing kill rules going forward

- A new historical bug class that the gate does *not* catch is a gap to close,
  not a shrug — encode it as a check or document why it can't be static.
- If the gate ever produces a false positive that blocks a real deploy, the
  check gets a suppression mechanism or a precision fix within one deploy
  cycle — a gate nobody trusts gets routed around, which is worse than no gate.
- Zero adoption: if the gate is not running on CWI deploys (dogfood first),
  the lane is reworked or killed per the trust-layer program rules.
