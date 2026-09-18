#!/usr/bin/env node
'use strict';
/**
 * deploy-gate — CWI Deploy Gate CLI
 * Pre-flight checks that catch the bug classes unit tests miss.
 * Usage: node bin/deploy-gate.js [options] [path]
 */

const path = require('path');
const gate = require('../lib/gate');

const VERSION = '1.0.0';

function usage() {
  return `deploy-gate v${VERSION} — CWI pre-flight deploy checks
Usage: deploy-gate [options] [path]

Options:
  --checks a,b,c     subset of: scope, labels, versioning, secrets (default: all)
  --base <ref>       git ref to diff against for the versioning check (default: HEAD)
  --changed a,b      explicit changed-file list (overrides git diff)
  --exclude <globs>  comma-separated glob prefixes to skip (e.g. test/fixtures/**,docs/**)
  --json             machine-readable output
  --version          print version
  --help             this help

Exit codes: 0 = clean, 1 = findings, 2 = usage/operational error.

Checks encode CWI's real deployment scar tissue:
  scope      inline-module scope audit — the DISTRICT_BEACONS ReferenceError (2026-09-17)
  labels     SAMPLE/LIVE badge audit — labels must read the mode (2026-09-18)
  versioning importer/module cache-bust — ?v= bump when both change (2026-09-17)
  secrets    secret-shaped values never ship — values are redacted in output`;
}

function parseArgs(argv) {
  const opts = { checks: null, base: 'HEAD', changed: null, exclude: [], json: false, path: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { console.log(usage()); process.exit(0); }
    else if (a === '--version') { console.log(VERSION); process.exit(0); }
    else if (a === '--checks') opts.checks = (argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--base') opts.base = argv[++i];
    else if (a === '--changed') opts.changed = new Set((argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean));
    else if (a === '--exclude') opts.exclude = (argv[++i] || '').split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--json') opts.json = true;
    else if (a.startsWith('--')) { console.error(`unknown option: ${a}`); console.error(usage()); process.exit(2); }
    else opts.path = path.resolve(a);
  }
  if (opts.checks) {
    const bad = opts.checks.filter(c => !gate.CHECKS.includes(c));
    if (bad.length) { console.error(`unknown checks: ${bad.join(', ')}`); process.exit(2); }
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  let result;
  try {
    result = gate.run(opts.path, { checks: opts.checks || undefined, exclude: opts.exclude, changed: opts.changed, base: opts.base });
  } catch (err) {
    console.error(`deploy-gate error: ${err.message}`);
    process.exit(2);
  }
  const { findings, filesScanned } = result;
  if (opts.json) {
    console.log(JSON.stringify({ version: VERSION, filesScanned, findings }, null, 2));
  } else {
    if (findings.length === 0) {
      console.log(`deploy-gate v${VERSION}: CLEAN — ${filesScanned} files scanned, 0 findings.`);
    } else {
      console.log(`deploy-gate v${VERSION}: ${findings.length} finding(s) in ${filesScanned} files scanned:`);
      for (const f of findings) {
        const loc = f.line > 0 ? `${f.file}:${f.line}` : f.file;
        console.log(`  [${f.check}] ${loc}\n           ${f.message}`);
      }
    }
  }
  process.exit(findings.length ? 1 : 0);
}

main();
