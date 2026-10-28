// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// resetLink.ts — S1.9: read the token from a #/reset-password?token=… link.
/** The token in a #/reset-password?token=… link, or null. */
export function resetTokenFromHash(hash: string = typeof window !== 'undefined' ? window.location.hash : ''): string | null {
  const m = /^#\/?reset-password\?token=([A-Za-z0-9_-]{20,200})/.exec(hash);
  return m ? m[1] : null;
}
