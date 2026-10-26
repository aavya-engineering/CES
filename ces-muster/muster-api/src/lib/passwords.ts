// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// passwords.ts — RBAC-01: temporary passwords and the password rule.
//
// Rule (NIST SP 800-171 3.5.7 / 3.5.8 as far as Muster can enforce today):
// at least 12 characters, at most 128, not the same as the current password,
// and not containing the email's local part. Reuse of older passwords
// (3.5.8 "prohibit reuse for a specified number of generations") needs a
// password history table — TBD with BHD.
import { randomBytes } from 'node:crypto';

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

// No look-alike characters (0/O, 1/l/I) so an admin can read it out.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** 20 characters from the crypto RNG, grouped for reading: xxxxx-xxxxx-xxxxx-xxxxx. */
export function temporaryPassword(): string {
  const bytes = randomBytes(40);
  let out = '';
  for (let i = 0; out.replace(/-/g, '').length < 20; i++) {
    const b = bytes[i];
    // Rejection sampling keeps the distribution uniform.
    if (b >= 256 - (256 % ALPHABET.length)) continue;
    out += ALPHABET[b % ALPHABET.length];
    if (out.replace(/-/g, '').length % 5 === 0 && out.replace(/-/g, '').length < 20) out += '-';
  }
  return out;
}

/** Null when acceptable, otherwise a plain-language reason. */
export function passwordProblem(password: string, email: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  if (local.length >= 3 && password.toLowerCase().includes(local)) return 'Do not use your email name in the password.';
  return null;
}
