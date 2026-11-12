// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

/** Environment for child processes (PowerShell sessions, runner commands): the API's own secrets never
 *  travel. Security review H2 (doc 49): children inherited JWT_SECRET, DATABASE_URL, ANTHROPIC_API_KEY. */
const SECRET_KEY = /^(JWT_SECRET|DATABASE_URL|ANTHROPIC_API_KEY|CES_RUNNER_.*)$|SECRET|PASSWORD|_TOKEN$|_KEY$/i;

export function childEnv(base: NodeJS.ProcessEnv = process.env, keep: string[] = []): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(base)) if (v !== undefined && (keep.includes(k) || !SECRET_KEY.test(k))) out[k] = v;
  return out;
}
