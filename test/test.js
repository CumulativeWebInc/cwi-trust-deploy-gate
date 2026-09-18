'use strict';
/**
 * deploy-gate test suite — zero dependencies.
 * Run: node test/test.js
 *
 * The ship gate: the suite MUST catch every reproduced historical bug class.
 * Zero catches -> DO NOT SHIP.
 */
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const gate = require('../lib/gate');
const ROOT = path.join(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok - ${name}`);
  } catch (err) {
    console.error(`  FAIL - ${name}`);
    console.error(`         ${err.message}`);
    process.exitCode = 1;
  }
}

const findingsFor = (check, dir) =>
  gate.run(path.join(FIX, dir), { checks: [check] }).findings;
const clean = (check, dir) =>
  findingsFor(check, dir).filter(f => /clean\./.test(f.file));

console.log('deploy-gate tests');

/* --- Check 1: inline-module scope audit (DISTRICT_BEACONS, 2026-09-17) --- */
test('scope: flags DISTRICT_BEACONS referenced above its callback scope', () => {
  const fs_ = findingsFor('scope', 'scope').filter(f => /bug\.js$/.test(f.file));
  assert.ok(fs_.length >= 2, `expected >=2 findings on scope/bug.js, got ${fs_.length}`);
  assert.ok(fs_.every(f => f.message.includes('DISTRICT_BEACONS')),
    'every finding names the offending identifier');
});
test('scope: clean fixture passes with zero findings', () => {
  const fs_ = clean('scope', 'scope');
  assert.strictEqual(fs_.length, 0, `expected 0, got: ${JSON.stringify(fs_, null, 1)}`);
});
test('scope: catches sibling-function leakage (outer fn, not top level)', () => {
  const src = `function outer() {\n  fetch('x').then(() => { const INNER = 1; });\n  return INNER;\n}`;
  const fs_ = gate.checkScopeFile('t.js', src);
  assert.ok(fs_.some(f => f.message.includes('INNER')), 'INNER must be flagged');
});
test('scope: braceless for-body shares the loop scope', () => {
  const src = `for (const x of [1, 2]) console.log(x);`;
  assert.strictEqual(gate.checkScopeFile('t.js', src).length, 0);
});
test('scope: var hoists to the function scope', () => {
  const src = `function f(c) {\n  if (c) { var x = 1; }\n  return x;\n}\nf(true);`;
  assert.strictEqual(gate.checkScopeFile('t.js', src).length, 0);
});
test('scope: catch param is visible in the catch block', () => {
  const src = `try { boom(); } catch (e) { console.log(e); }\nfunction boom() {}`;
  assert.strictEqual(gate.checkScopeFile('t.js', src).length, 0);
});
test('scope: does not flag properly hoisted top-level declarations', () => {
  const src = `const A = 1;\nfunction f() { return A + B; }\nconst B = 2;\nf();`;
  assert.strictEqual(gate.checkScopeFile('t.js', src).length, 0);
});
test('scope: block-scoped function not visible outside its block', () => {
  const src = `if (true) { function helper() {} }\nhelper();`;
  const fs_ = gate.checkScopeFile('t.js', src);
  assert.ok(fs_.some(f => f.message.includes('helper')), 'helper must be flagged');
});

/* --- Check 2: SAMPLE/LIVE label audit (3D world, 2026-09-18) --- */
test('labels: flags hardcoded SAMPLE/LIVE badges in HTML and JS', () => {
  const fs_ = findingsFor('labels', 'labels').filter(f => /bug\./.test(f.file));
  assert.ok(fs_.length >= 3, `expected >=3 findings on label bug fixtures, got ${fs_.length}: ${JSON.stringify(fs_)}`);
});
test('labels: mode-driven labels pass (ternary, map, variable)', () => {
  const fs_ = clean('labels', 'labels');
  assert.strictEqual(fs_.length, 0, `expected 0, got: ${JSON.stringify(fs_, null, 1)}`);
});
test('labels: data bindings are not flagged', () => {
  const src = `<span class="badge">{{ modeLabel }}</span>\n<div data-bind="text: badge"></div>`;
  assert.strictEqual(gate.checkLabelsFile('t.html', src).length, 0);
});

/* --- Check 3: cache-bust versioning (Pages split-brain, 2026-09-17) --- */
const VCHANGED = new Set(['index-bug.html', 'index-clean.html', 'stage-logic.js']);
test('versioning: flags unversioned import of a changed module', () => {
  const { findings } = gate.run(path.join(FIX, 'versioning'),
    { checks: ['versioning'], changed: VCHANGED });
  const bug = findings.filter(f => /index-bug\.html/.test(f.file));
  assert.strictEqual(bug.length, 1, `expected 1, got: ${JSON.stringify(bug)}`);
  assert.ok(bug[0].message.includes('stage-logic.js'), 'names the changed module');
});
test('versioning: versioned import passes; unchanged module needs no bump', () => {
  const { findings } = gate.run(path.join(FIX, 'versioning'),
    { checks: ['versioning'], changed: VCHANGED });
  assert.ok(!findings.some(f => /index-clean\.html/.test(f.file)), 'index-clean must pass');
  assert.ok(!findings.some(f => f.message.includes('stable.js')), 'stable.js needs no bump');
});

/* --- Check 4: secret scan --- */
test('secrets: flags secret-shaped values, filenames, and key blocks', () => {
  const fs_ = findingsFor('secrets', 'secret-scan').filter(f => !/clean\.txt$/.test(f.file));
  const kinds = new Set(fs_.map(f => f.file));
  assert.ok(kinds.has('leak.txt'), 'leak.txt flagged');
  assert.ok(kinds.has('notes.key'), '.key filename flagged');
  assert.ok(fs_.some(f => f.message.includes('PRIVATE KEY') || f.message.includes('private-key')),
    'private-key block flagged');
});
test('secrets: NEVER prints the secret value in output', () => {
  let out = '';
  try {
    out = execFileSync(process.execPath,
      [path.join(ROOT, 'bin', 'deploy-gate.js'), '--checks', 'secrets', path.join(FIX, 'secret-scan')],
      { encoding: 'utf8' });
  } catch (e) { out = e.stdout || ''; } // exit 1 expected — findings exist
  assert.ok(out.includes('finding(s)'), 'expected findings in output');
  for (const secret of ['sk-test-FAKE-0000', 'hunter2-fake-notreal', 'tok_test_FAKE_1234', 'MIIFakeNotARealKeyMaterial']) {
    assert.ok(!out.includes(secret), `output leaked a secret value: ${secret}`);
  }
});
test('secrets: clean fixture passes', () => {
  assert.strictEqual(clean('secrets', 'secret-scan').length, 0);
});

/* --- Dogfood: the gate is clean on its own codebase --- */
test('dogfood: gate source passes its own scope check', () => {
  for (const f of ['lib/gate.js', 'bin/deploy-gate.js', 'test/test.js']) {
    const fs_ = gate.checkScopeFile(f, fs.readFileSync(path.join(ROOT, f), 'utf8'));
    assert.strictEqual(fs_.length, 0, `${f}: ${JSON.stringify(fs_, null, 1)}`);
  }
});
test('dogfood: gate source passes its own labels and secrets checks', () => {
  const files = [
    { full: path.join(ROOT, 'lib/gate.js'), rel: 'lib/gate.js' },
    { full: path.join(ROOT, 'bin/deploy-gate.js'), rel: 'bin/deploy-gate.js' },
    { full: path.join(ROOT, 'test/test.js'), rel: 'test/test.js' },
  ];
  const ls = gate.checkLabels(ROOT, files);
  assert.strictEqual(ls.length, 0, JSON.stringify(ls, null, 1));
  const ss = gate.checkSecrets(ROOT, files);
  assert.strictEqual(ss.length, 0, JSON.stringify(ss, null, 1));
});

/* --- CLI behaviour --- */
test('CLI: exit 1 with findings, exit 0 when clean', () => {
  let code = 0;
  try {
    execFileSync(process.execPath,
      [path.join(ROOT, 'bin', 'deploy-gate.js'), '--checks', 'scope', path.join(FIX, 'scope', 'bug.js')],
      { stdio: 'pipe' });
  } catch (e) { code = e.status; }
  assert.strictEqual(code, 1, 'findings -> exit 1');
  // clean run: scope check on the clean file only
  execFileSync(process.execPath,
    [path.join(ROOT, 'bin', 'deploy-gate.js'), '--checks', 'scope', path.join(FIX, 'scope', 'clean.js')],
    { stdio: 'pipe' });
});
test('CLI: --json emits machine-readable findings', () => {
  const out = execFileSync(process.execPath,
    [path.join(ROOT, 'bin', 'deploy-gate.js'), '--checks', 'labels', '--json', path.join(FIX, 'labels', 'clean.js')],
    { encoding: 'utf8' });
  const j = JSON.parse(out);
  assert.strictEqual(j.findings.length, 0);
  assert.ok(typeof j.filesScanned === 'number');
});
test('CLI: rejects unknown checks with exit 2', () => {
  let code = 0;
  try { execFileSync(process.execPath, [path.join(ROOT, 'bin', 'deploy-gate.js'), '--checks', 'nope'], { stdio: 'pipe' }); }
  catch (e) { code = e.status; }
  assert.strictEqual(code, 2);
});

console.log(`\n${passed} tests passed${process.exitCode ? ' (WITH FAILURES)' : ''}.`);
