// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// icons.tsx — S1.9 (demo feedback 2026-10-27): the outline icon set the
// mockups use (lucide-react). Two entry points:
//   <NavIcon name="…"/>   sidebar icons, by a stable name from nav.ts
//   <GlyphIcon glyph="…"/> page and tile icons: the short glyphs pages already
//                          pass to PageHeader / Stat map to an icon; a glyph with
//                          no icon (e.g. "5", "L1") is shown as text.
import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  BookOpen,
  Building2,
  ChartColumn,
  CircleCheck,
  CircleHelp,
  CirclePause,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Compass,
  Database,
  FileBadge,
  Fingerprint,
  GitCompare,
  HardDrive,
  Plug,
  FileCode,
  FilePlus2,
  FileSignature,
  FileText,
  Files,
  FlaskConical,
  Folder,
  FolderOpen,
  Gauge,
  House,
  KeyRound,
  Layers,
  LayoutDashboard,
  ListChecks,
  Network,
  Pencil,
  Radar,
  Route,
  ScrollText,
  Settings,
  Settings2,
  ShieldCheck,
  Sigma,
  Tag,
  Target,
  TriangleAlert,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';

const NAV: Record<string, LucideIcon> = {
  home: House,
  shared: Workflow,
  overview: FileText,
  'reference-data': FileText,
  requirements: ClipboardList,
  sprs: ChartColumn,
  objectives: Target,
  'standard-evidence': FileText,
  catalog: Files,
  mapping: Network,
  rules: ListChecks,
  'contract-validation': FileCode,
  golden: FileBadge,
  tests: FlaskConical,
  engagements: Folder,
  tenants: Building2,
  'engagements-all': FolderOpen,
  'engagement-create': FilePlus2,
  workspace: LayoutDashboard,
  muster: ClipboardCheck,
  stamper: Settings2,
  adminops: Users,
  evidenceops: FileText,
  situation: Compass,
  discovery: Radar,
  readiness: Gauge,
  plan: Route,
  contracts: FileSignature,
  quick: Zap,
  help: CircleHelp,
  platform: Settings,
  users: Users,
  roles: ShieldCheck,
  audit: ScrollText,
  bell: Bell,
  registry: BookOpen,
  compat: GitCompare,
  interfaces: Plug,
  tokens: KeyRound,
  passkeys: Fingerprint,
  integrity: HardDrive,
  guide: BookOpen,
};

export function NavIcon({ name, size = 20 }: { name?: string; size?: number }) {
  const Icon = (name && NAV[name]) || FileText;
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" focusable="false" />;
}

const GLYPH: Record<string, LucideIcon> = {
  '▤': ClipboardList,
  '⛨': ShieldCheck,
  'Σ': Sigma,
  '⇄': Network,
  '▣': Files,
  '⛁': Database,
  '✓': CircleCheck,
  '◷': Clock,
  '!': TriangleAlert,
  '?': CircleHelp,
  '⚙': ListChecks,
  '◎': Target,
  '👤': Users,
  '👥': Users,
  '⚖': ShieldCheck,
  '≣': ScrollText,
  '◈': Workflow,
  '{ }': FileCode,
  '⌂': House,
  '⚑': Tag,
  '✎': Pencil,
  '↓': ChartColumn,
  '↑': ChartColumn,
  '▲': ChartColumn,
  '⏸': CirclePause,
  '⚿': KeyRound,
  '◇': Layers,
  '⏵': Clock,
  '…': Clock,
};

export function GlyphIcon({ glyph, size = 24 }: { glyph: string; size?: number }) {
  const Icon = GLYPH[glyph];
  if (!Icon) return <span className="glyph-text">{glyph}</span>;
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" focusable="false" />;
}
