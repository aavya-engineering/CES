const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');
const { applyTheme } = require('/root/.claude/skills/synced/4f83ab31-7552-4521-8535-0320c976bac4_9560f155-d925-4c4a-b894-0aab5f9223f3/pptx/scripts/apply_theme.js');
const SIZES = JSON.parse(fs.readFileSync(path.join(__dirname, 'sizes.json'), 'utf8'));
const CROP = path.join(__dirname, 'crop');

const THEME = { name: 'CES Navy', headFontFace: 'Cambria', bodyFontFace: 'Calibri',
  colors: { dk1: '1F2937', lt1: 'FFFFFF', dk2: '1E2761', lt2: 'EEF3FA', accent1: '1E2761', accent2: 'C8A24A', accent3: '5B6470', accent4: '188038', accent5: '8430CE', accent6: 'C5221F', hlink: '1E2761', folHlink: '5B6470' } };
const pres = new pptxgen(); pres.layout = 'LAYOUT_16x9'; pres.theme = { headFontFace: 'Cambria', bodyFontFace: 'Calibri' }; pres.author = 'Aavya Engineering'; pres.title = 'CES — evidence and assessment traceability';
const C = pres.SchemeColor;
pres.defineSlideMaster({ title: 'DARK', background: { color: THEME.colors.dk2 }, objects: [
  { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 1.6, w: 8.8, h: 1.4, fontSize: 38, bold: true, color: C.background1, align: 'left', margin: 0 }, text: 'Title' } },
  { placeholder: { options: { name: 'body', type: 'body', x: 0.6, y: 3.1, w: 8.8, h: 1.6, fontSize: 16, color: C.background2, align: 'left', margin: 0 }, text: 'Subtitle' } }] });
pres.defineSlideMaster({ title: 'CONTENT', background: { color: THEME.colors.lt1 }, objects: [
  { placeholder: { options: { name: 'title', type: 'title', x: 0.5, y: 0.35, w: 9, h: 0.7, fontSize: 24, bold: true, color: C.text2, align: 'left', margin: 0 }, text: 'Title' } },
  { text: { text: 'CES — evidence and assessment traceability · Aavya for Blue Heron Defense · demo data', options: { x: 0.5, y: 5.2, w: 7.5, h: 0.3, fontSize: 9, color: C.accent3, margin: 0 } } }],
  slideNumber: { x: 9.2, y: 5.2, w: 0.5, h: 0.3, fontSize: 9, color: THEME.colors.accent3 } });
const T = (s, text, o) => s.addText(text, { fontSize: 11, color: C.text1, margin: 0, isTextBox: true, valign: 'top', ...o });

pres.addSection({ title: 'Traceability' });
// 1 title
{ const s = pres.addSlide({ masterName: 'DARK', sectionTitle: 'Traceability' });
  s.addText('How a requirement becomes evidence an assessor can trust', { placeholder: 'title' });
  s.addText('Where the evidence comes from, how it is checked, where the reports are, and what the assessor sees\nCES platform, master · 12 November 2026', { placeholder: 'body' });
  s.addNotes('Answers the three questions a customer or assessor asks: how was evidence generated and checked, how were the 110 requirements fulfilled, where is the report.'); }

// 2 chain
{ const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Traceability' });
  s.addText('The chain — every link is a row in the database with an actor and a time', { placeholder: 'title' });
  const steps = [['110 requirements', 'NIST SP 800-171 · SPRS weight 1/3/5'], ['320 objectives', 'NIST 800-171A assessment objectives'], ['Registry read', '201 PowerShell get-commands · entry_id → objectives'], ['Capture', 'raw output file · SHA-256 · run id'], ['Evidence item', 'source · requirement/objective ids · hash · status'], ['Review', 'a different person approves (SoD)'], ['SSP statement', 'per requirement · draft → approved'], ['Package', 'versioned · validated · signed · immutable'], ['Assessor view', 'read-only · request → answer trail']];
  steps.forEach(([t, d], i) => { const col = i % 5, row = Math.floor(i / 5); const x = 0.5 + col * 1.85, y = 1.3 + row * 1.9;
    s.addShape(pres.ShapeType.roundRect, { x, y, w: 1.7, h: 1.55, fill: { color: i === 8 ? C.accent2 : C.background2 }, line: { color: i === 8 ? C.accent2 : C.background2 }, rectRadius: 0.08 });
    T(s, String(i + 1), { x: x + 0.1, y: y + 0.08, w: 0.4, h: 0.3, fontSize: 11, bold: true, color: C.accent3 });
    T(s, t, { x: x + 0.1, y: y + 0.35, w: 1.5, h: 0.45, fontSize: 13, bold: true, color: i === 8 ? C.background1 : C.text2 });
    T(s, d, { x: x + 0.1, y: y + 0.8, w: 1.5, h: 0.7, fontSize: 9.5, color: i === 8 ? C.background1 : C.text1 });
    if (col < 4) s.addShape(pres.ShapeType.rightArrow, { x: x + 1.72, y: y + 0.65, w: 0.12, h: 0.25, fill: { color: C.accent3 }, line: { color: C.accent3 } }); });
  T(s, 'Nothing is credited that was not read: an objective the engine could not read stays “unknown” until a document or a person settles it; a run where every command failed records nothing.', { x: 0.5, y: 4.75, w: 9, h: 0.4, fontSize: 10.5, color: C.accent3 });
  s.addNotes('Walk the chain left to right. Every box is a table or a column in muster_db; every transition writes an audit_events row.'); }

// 3 how evidence is generated and checked
{ const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Traceability' });
  s.addText('How evidence is generated — three sources, one review', { placeholder: 'title' });
  const cards = [['Discovery (engine)', 'Run assessment walks the registry against the tenant (or simulator), read-only. Each observation carries a raw_capture_ref; the capture becomes a draft evidence item with its SHA-256, the run id, the entry ids and the objectives it supports.', 'source = discovery'], ['Remediation runs', 'Stamper / AdminOps runs post their steps and captures; each capture becomes evidence tagged with the run, so “what changed and what it looked like after” is on file. Simulate mode records the plan only — the tenant is not touched.', 'source = stamper · adminops'], ['Manual uploads', 'Policies, training records, physical controls: a person uploads or pastes, picks requirement and objectives, and — where the NIST catalog has a definition — the exact artefact the assessor expects.', 'source = manual']];
  cards.forEach(([t, d, f], i) => { const x = 0.5 + i * 3.05; s.addShape(pres.ShapeType.roundRect, { x, y: 1.25, w: 2.9, h: 2.55, fill: { color: C.background2 }, line: { color: C.background2 }, rectRadius: 0.08 }); T(s, t, { x: x + 0.15, y: 1.37, w: 2.6, h: 0.4, fontSize: 14, bold: true, color: C.text2 }); T(s, d, { x: x + 0.15, y: 1.8, w: 2.6, h: 1.6, fontSize: 10.5 }); T(s, f, { x: x + 0.15, y: 3.45, w: 2.6, h: 0.3, fontSize: 9.5, fontFace: 'Courier New', color: C.accent3 }); });
  s.addShape(pres.ShapeType.roundRect, { x: 0.5, y: 3.95, w: 9, h: 1.1, fill: { color: 'FFF8E1' }, line: { color: THEME.colors.accent2 }, rectRadius: 0.08 });
  T(s, 'Checked, not just collected', { x: 0.65, y: 4.03, w: 8.7, h: 0.3, fontSize: 12, bold: true, color: C.text2 });
  T(s, 'Every item goes draft → submitted → validated or rejected. The reviewer must be a different person from the submitter (the API refuses otherwise). A new version supersedes, never overwrites. Engine captures are hashed at ingest; a changed file no longer matches its stored SHA-256.', { x: 0.65, y: 4.33, w: 8.7, h: 0.7, fontSize: 10.5 });
  s.addNotes('Three sources, one review path. Separation of duties is enforced by the API, not just hinted in the UI.'); }

// 4 the 110 — how they get fulfilled
{ const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Traceability' });
  s.addText('How the 110 requirements get to “met”', { placeholder: 'title' });
  const rows = [['96 of 110 controls', 'have at least one automated read in the registry (201 get-commands). The engine can observe their technical state.'], ['~133 of 320 objectives', 'are plausibly settled by those reads alone (41 %).'], ['~150 objectives', 'sit on readable controls but are procedural, documentary, physical or training — they need a document or a person (manual evidence + review).'], ['14 controls (37 objectives)', 'are manual-only: no readable surface at all.'], ['SPRS', 'computed from the 110 statuses with the DoD weights (1/3/5): −203 to 110. Only “met” counts; “unknown” and “not met” both subtract.']];
  rows.forEach(([a, b], i) => { const y = 1.25 + i * 0.68; s.addShape(pres.ShapeType.roundRect, { x: 0.5, y, w: 2.6, h: 0.58, fill: { color: C.accent1 }, line: { color: C.accent1 }, rectRadius: 0.06 }); T(s, a, { x: 0.6, y: y + 0.05, w: 2.4, h: 0.48, fontSize: 12.5, bold: true, color: C.background1, valign: 'middle' }); T(s, b, { x: 3.3, y: y + 0.02, w: 6.2, h: 0.6, fontSize: 11, valign: 'middle' }); });
  T(s, 'Source: registry-objective-coverage (BHD, 2026-07-10); SPRS weights in the vendored reference data. Overrides by a person are allowed, need a written reason, and are shown as overrides to the assessor.', { x: 0.5, y: 4.7, w: 9, h: 0.45, fontSize: 10, color: C.accent3 });
  s.addNotes('This is the honest math: roughly four in ten objectives can be retired by discovery; six in ten are the compliance manager’s evidence work. That is CMMC, not a gap in the tool.'); }

// 5 where the reports are
{ const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Traceability' });
  s.addText('Where the reports are', { placeholder: 'title' });
  const head = ['You want…', 'In the portal', 'API / export'];
  const rows = [['Status of all 110 + SPRS', 'Assess › Readiness (family table)', 'Prepare › Reports › readiness · GET /assessments/:run/results'], ['Which requirements have evidence, which do not', 'Evidence › Overview', 'Reports › coverage'], ['Gaps, heaviest first', 'Assess › Gaps (CSV)', 'Reports › gaps'], ['SPRS calculation', 'Assess › Readiness', 'Reports › sprs'], ['POA&M', 'Plan › POA&M', 'Reports › poam'], ['Every evidence item with hash, source, run, reviewer', 'Evidence › Explorer (open item)', 'Reports › evidence-inventory'], ['The assessor bundle', 'Prepare › Packages → Build → Validate → Sign off', 'GET /prepare/packages/:id/export (manifest + items)'], ['SSP', 'Prepare › SSP', 'GET /prepare/ssp/export (Markdown)'], ['Who did what, when', 'Monitor › Activity · Administration › Audit log', 'GET …/monitor/activity · /api/audit-events']];
  const data = [head.map((t) => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: THEME.colors.dk2 }, fontSize: 10.5 } })), ...rows.map((r) => r.map((t, i) => ({ text: t, options: { fontSize: 9.5, bold: i === 0, color: THEME.colors.dk1, fill: { color: 'FFFFFF' }, fontFace: i === 2 ? 'Courier New' : 'Calibri' } })))];
  s.addTable(data, { x: 0.5, y: 1.15, w: 9, colW: [2.7, 2.9, 3.4], border: { type: 'solid', color: 'D0D7E2', pt: 0.5 }, rowH: 0.36, margin: 0.04 });
  T(s, 'Formats: JSON, Markdown, CSV (cells are formula-safe). The numbers on the screens and in the exports come from one calculator.', { x: 0.5, y: 4.8, w: 9, h: 0.35, fontSize: 10, color: C.accent3 });
  s.addNotes('Reports are generated from the same tables the screens read; there is no second copy of the truth.'); }

// 6 what the assessor sees
{ const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Traceability' });
  s.addText('What the assessor sees, and how it is recorded', { placeholder: 'title' });
  const [w, h] = SIZES['26-prepare-assessor.jpg']; const iw = 5.4, ih = Math.min(3.95, iw * h / w);
  s.addImage({ path: path.join(CROP, '26-prepare-assessor.jpg'), x: 0.5, y: 1.15, w: iw, h: ih }); s.addShape(pres.ShapeType.rect, { x: 0.5, y: 1.15, w: iw, h: ih, fill: { type: 'none' }, line: { color: 'D0D7E2', width: 0.75 } });
  const pts = ['Role assessor_read_only: Prepare only, nothing else in the sidebar, no write anywhere', 'Sees the signed package: manifest, items with hashes, SSP statements, POA&M', 'Asks for an item or a clarification → request (open) → compliance manager answers with evidence or a note → closed. The trail stays with the engagement', 'Overrides are visible as overrides, with the reason and the person', 'A signed package cannot change; a new build makes a new version and marks the old one superseded'];
  s.addText(pts.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < pts.length - 1 } })), { x: 6.1, y: 1.15, w: 3.4, h: 3.9, fontSize: 10.5, color: C.text1, margin: 0, isTextBox: true, valign: 'top', paraSpaceAfter: 6 });
  s.addNotes('The request/answer trail is the record that the assessor examined the evidence. An assessor dry run (M5) with a C3PAO is still to be scheduled.'); }

// 7 proof by screens
{ const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Traceability' });
  s.addText('Where to click when someone asks “show me”', { placeholder: 'title' });
  const shots = [['16-evidence-explorer.jpg', 'Evidence › Explorer — every item, source, hash, status'], ['25-prepare-packages.jpg', 'Prepare › Packages — build, validate, sign off, export'], ['27-prepare-reports.jpg', 'Prepare › Reports — readiness, coverage, gaps, SPRS, POA&M, inventory']];
  shots.forEach(([f, cap], i) => { const [w, h] = SIZES[f]; const x = 0.5 + i * 3.05, bw = 2.9; const bh = Math.min(2.6, bw * h / w); s.addImage({ path: path.join(CROP, f), x, y: 1.2, w: bw, h: bh }); s.addShape(pres.ShapeType.rect, { x, y: 1.2, w: bw, h: bh, fill: { type: 'none' }, line: { color: 'D0D7E2', width: 0.75 } }); T(s, cap, { x, y: 3.9, w: bw, h: 0.6, fontSize: 10, color: C.text2, bold: true }); });
  T(s, 'Also: Assess › Gaps (open a gap → objectives → override drawer) and Monitor › Activity (the audit trail for the engagement).', { x: 0.5, y: 4.7, w: 9, h: 0.4, fontSize: 10.5, color: C.accent3 }); }

// 8 caveats
{ const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Traceability' });
  s.addText('What is proven today, and what is still to come', { placeholder: 'title' });
  const left = ['Chain, hashes, SoD review, overrides with reasons, audit trail — in code, tested, on master', 'Postgres smoke and the browser walk pass on the simulator', 'NIST catalog release 0 (AC.L2-3.1.1) with the batch validator'];
  const right = ['First engine run on a Windows host — the demo tenant still shows an empty read (SPRS −203) because macOS cannot run PowerShell', 'Catalog rows for the other 109 requirements — BHD batches', 'Live tenant run (rung 3) on a BHD test tenant', 'Assessor dry run with a C3PAO (success measure M5)', 'Signed results from a dedicated runner identity; WORM evidence store if evidence is ruled CUI'];
  T(s, 'Proven', { x: 0.5, y: 1.15, w: 4.3, h: 0.4, fontSize: 16, bold: true, color: C.accent4 });
  s.addText(left.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < left.length - 1 } })), { x: 0.5, y: 1.6, w: 4.3, h: 3.4, fontSize: 12, color: C.text1, margin: 0, isTextBox: true, valign: 'top', paraSpaceAfter: 6 });
  T(s, 'Next', { x: 5.2, y: 1.15, w: 4.3, h: 0.4, fontSize: 16, bold: true, color: C.accent2 });
  s.addText(right.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < right.length - 1 } })), { x: 5.2, y: 1.6, w: 4.3, h: 3.4, fontSize: 12, color: C.text1, margin: 0, isTextBox: true, valign: 'top', paraSpaceAfter: 6 });
  s.addNotes('Say this plainly: the mechanism is built and tested; the first real numbers come from the Windows run and the first live tenant.'); }

(async () => { const out = path.join(__dirname, 'CES-Evidence-Traceability.pptx'); await pres.writeFile({ fileName: out }); await applyTheme(out, THEME); console.log('written'); })();
