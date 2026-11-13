// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// validators.ts — QA 2026-11-13: "a contact field should take a contact". Shared
// semantic checks for free-text fields (the API only checks length).
export const PERSON_NAME = /^[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ .'\-]{0,199}$/;
/** For the HTML `pattern` attribute (no anchors, no flags). */
export const PERSON_NAME_PATTERN = "[A-Za-z\\u00C0-\\u024F][A-Za-z\\u00C0-\\u024F .'\\-]{0,199}";
export const PERSON_NAME_HELP = 'A person\'s name: letters, spaces, dots, apostrophes or hyphens.';
export const NAME_HAS_LETTERS = /[A-Za-zÀ-ɏ]{2}/;
export const PHONE = /^\+?[-0-9 ()]{7,20}$/;
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function personName(v: string | null | undefined): string {
  const s = (v ?? '').trim();
  if (!s) return '';
  if (!PERSON_NAME.test(s)) return PERSON_NAME_HELP;
  return '';
}
/** An organisation, system or asset name: at least two letters somewhere, not just digits or symbols. */
export function thingName(v: string | null | undefined, what = 'Name'): string {
  const s = (v ?? '').trim();
  if (!s) return '';
  if (!NAME_HAS_LETTERS.test(s)) return `${what} must contain letters, not only digits or symbols.`;
  if (/(.)\1{9,}/.test(s)) return `${what} looks like a filler value (the same character repeated).`;
  return '';
}
