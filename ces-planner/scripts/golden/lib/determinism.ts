// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MONO-2026A
// See LICENSE and TERMS.md.

/**
 * MG-04 golden generator — determinism shim.
 *
 * Planner generators stamp ids and timestamps from `Date.now()`, `new Date()`
 * and `Math.random()` (see src/shared/utils/idGenerator.ts). A golden file is
 * only useful if two runs on the same input produce identical bytes, so the
 * generator pins the clock and seeds the PRNG BEFORE any Planner module is
 * imported. Call installDeterminism() first, then import generators dynamically.
 */

export function installDeterminism(isoClock: string, seed: number): void {
  // Planner date arithmetic is local-time (planHelpers.addDays uses setDate/getDate on a
  // UTC-parsed date), so milestone target_date values move by one day across a DST change
  // in US time zones. Pin UTC so goldens do not depend on where they are generated.
  // The underlying bug is reported to BHD; it is not fixed here.
  process.env.TZ = 'UTC';

  const fixedMs = Date.parse(isoClock);
  if (Number.isNaN(fixedMs)) {
    throw new Error(`fixture clock is not an ISO timestamp: ${isoClock}`);
  }

  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        super(fixedMs);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        super(...(args as [any]));
      }
    }
    static now(): number {
      return fixedMs;
    }
  }
  globalThis.Date = FixedDate as unknown as DateConstructor;

  // mulberry32 — small, fast, good enough for id suffixes.
  let state = seed >>> 0;
  Math.random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable JSON: object keys sorted, two-space indent, trailing newline, LF. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 2) + '\n';
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}
