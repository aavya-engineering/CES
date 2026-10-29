#!/usr/bin/env node
// scripts/audit-gate.mjs — CI supply-chain gate (G-ENG-3, NIST SP 800-171 3.14.1).
//
// Runs `npm audit --omit=dev --json` for the workspace and fails on any HIGH or
// CRITICAL production advisory that is not in .audit-allowlist.json. An
// allowlist entry needs a reason, an owner and an expiry date; an expired entry
// fails the build again, so an accepted risk cannot be forgotten.
//
//   node scripts/audit-gate.mjs            # exit 1 on unaccepted high/critical
//   node scripts/audit-gate.mjs --level critical
//
// Why not plain `npm audit --audit-level=high`: it has no allowlist, so one
// breaking upgrade we cannot ship this sprint (e.g. zod 3→4 across 46 files)
// turns the gate red for everyone and people stop looking at it.
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const level = process.argv.includes('--level') ? process.argv[process.argv.indexOf('--level') + 1] : 'high';
const RANK = { low: 0, moderate: 1, high: 2, critical: 3 };
const threshold = RANK[level] ?? 2;

let report;
try {
  report = JSON.parse(execSync('npm audit --omit=dev --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
} catch (e) {
  // npm audit exits 1 when it finds anything; the JSON is still on stdout.
  if (e.stdout) report = JSON.parse(e.stdout);
  else {
    console.error('audit-gate: npm audit failed to run:', e.message);
    process.exit(2);
  }
}

const allowFile = '.audit-allowlist.json';
const allow = existsSync(allowFile) ? JSON.parse(readFileSync(allowFile, 'utf8')) : { entries: [] };
const today = new Date().toISOString().slice(0, 10);
const byId = new Map();
for (const a of allow.entries ?? []) {
  for (const k of ['advisory', 'reason', 'owner', 'expires']) {
    if (!a[k]) {
      console.error(`audit-gate: ${allowFile} entry for ${a.advisory ?? a.package ?? '?'} is missing "${k}"`);
      process.exit(2);
    }
  }
  byId.set(a.advisory, a);
}

const failures = [];
const accepted = [];
for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
  if ((RANK[v.severity] ?? 0) < threshold) continue;
  const advisories = v.via.filter((x) => typeof x === 'object').map((x) => ({ id: x.url?.split('/').pop() ?? String(x.source), title: x.title, severity: x.severity }));
  // Transitive entries list the parent package name in `via`; those are reported on the parent.
  if (!advisories.length) continue;
  for (const adv of advisories) {
    if ((RANK[adv.severity] ?? 0) < threshold) continue;
    const a = byId.get(adv.id);
    if (a && a.expires >= today) accepted.push({ name, ...adv, expires: a.expires, owner: a.owner });
    else failures.push({ name, ...adv, expired: a ? a.expires : null, fix: v.fixAvailable });
  }
}

for (const a of accepted) console.log(`audit-gate: ACCEPTED ${a.name} ${a.id} (${a.severity}) until ${a.expires} — owner ${a.owner}`);
if (failures.length) {
  console.error(`\naudit-gate: ${failures.length} unaccepted ${level}+ production advisor${failures.length === 1 ? 'y' : 'ies'}:`);
  for (const f of failures) {
    const fix = f.fix === true ? 'fix: npm update' : f.fix ? `fix: ${f.fix.name}@${f.fix.version}${f.fix.isSemVerMajor ? ' (major)' : ''}` : 'no fix';
    console.error(`  ${f.name}  ${f.severity}  ${f.id}  ${f.title}${f.expired ? `  [allowlist EXPIRED ${f.expired}]` : ''}  ${fix}`);
  }
  console.error(`\nFix the dependency, or add a reasoned, dated entry to ${allowFile}.`);
  process.exit(1);
}
console.log(`audit-gate: no unaccepted ${level}+ production advisories.`);
