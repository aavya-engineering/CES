// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// requirementFilter.ts — UI-02: search and filters shared by the 110
// Requirements and SPRS Weight Table pages.
import { useMemo, useState } from 'react';
import type { RequirementRow } from './referenceData';

export function useRequirementFilter(rows: readonly RequirementRow[], initialQ = '') {
  const [q, setQ] = useState(initialQ);
  const [family, setFamily] = useState('');
  const [level, setLevel] = useState('');
  const [weight, setWeight] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!family || r.family === family) &&
        (!level || String(r.cmmc_level) === level) &&
        (!weight || String(r.weight) === weight) &&
        (!needle ||
          r.control_id.toLowerCase().includes(needle) ||
          r.nist_ref.includes(needle) ||
          r.practice.toLowerCase().includes(needle))
    );
  }, [rows, q, family, level, weight]);
  const clear = () => {
    setQ('');
    setFamily('');
    setLevel('');
    setWeight('');
  };
  return { q, setQ, family, setFamily, level, setLevel, weight, setWeight, filtered, clear };
}

