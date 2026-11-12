const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');
const { applyTheme } = require('/root/.claude/skills/synced/4f83ab31-7552-4521-8535-0320c976bac4_9560f155-d925-4c4a-b894-0aab5f9223f3/pptx/scripts/apply_theme.js');

const SHOTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'screens.json'), 'utf8'));
const SIZES = JSON.parse(fs.readFileSync(path.join(__dirname, 'sizes.json'), 'utf8'));
const CROP = path.join(__dirname, 'crop');

const THEME = { name: 'CES Navy', headFontFace: 'Cambria', bodyFontFace: 'Calibri',
  colors: { dk1: '1F2937', lt1: 'FFFFFF', dk2: '1E2761', lt2: 'EEF3FA', accent1: '1E2761', accent2: 'C8A24A', accent3: '5B6470', accent4: '188038', accent5: '8430CE', accent6: 'C5221F', hlink: '1E2761', folHlink: '5B6470' } };

const pres = new pptxgen();
pres.layout = 'LAYOUT_16x9';
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.author = 'Aavya Engineering'; pres.title = 'CES platform walkthrough';
const C = pres.SchemeColor;

pres.defineSlideMaster({ title: 'DARK', background: { color: THEME.colors.dk2 }, objects: [
  { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 1.6, w: 8.8, h: 1.4, fontSize: 40, bold: true, color: C.background1, align: 'left', margin: 0 }, text: 'Title' } },
  { placeholder: { options: { name: 'body', type: 'body', x: 0.6, y: 3.1, w: 8.8, h: 1.4, fontSize: 18, color: C.background2, align: 'left', margin: 0 }, text: 'Subtitle' } },
] });
pres.defineSlideMaster({ title: 'CONTENT', background: { color: THEME.colors.lt1 }, objects: [
  { placeholder: { options: { name: 'title', type: 'title', x: 0.5, y: 0.35, w: 9, h: 0.7, fontSize: 28, bold: true, color: C.text2, align: 'left', margin: 0 }, text: 'Title' } },
  { text: { text: 'CES — Compliance Evidence System · Aavya for Blue Heron Defense · demo data', options: { x: 0.5, y: 5.2, w: 7.5, h: 0.3, fontSize: 9, color: C.accent3, margin: 0 } } },
], slideNumber: { x: 9.2, y: 5.2, w: 0.5, h: 0.3, fontSize: 9, color: THEME.colors.accent3 } });

const notes = (s, t) => s.addNotes(t);

// 1 title
{ const s = pres.addSlide({ masterName: 'DARK' });
  pres.addSection({ title: 'Introduction' }); s.sectionTitle = 'Introduction';
  s.addText('CES — Compliance Evidence System', { placeholder: 'title' });
  s.addText('Platform walkthrough, screen by screen · for new users and new engineers\nState: master, 12 November 2026 · demo data (Contoso Defense, simulator tenant)', { placeholder: 'body' });
  notes(s, 'Walk through the product the way a customer meets it. Every screenshot is from the demo tenant; nothing here is a real customer.'); }

// 2 what CES is
{ const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Introduction' });
  s.addText('Seven steps, seven sections of the portal', { placeholder: 'title' });
  const steps = [['Onboard', 'who, which tenants, where the CUI boundary sits'], ['Assess', 'read the tenant, score it (SPRS)'], ['Plan', 'owned, dated actions and a POA&M'], ['Remediate', 'simulate first; live only behind approval and a gate'], ['Collect Evidence', 'gather and review what the assessor asks for'], ['Monitor', 'evaluate, raise findings, track drift'], ['Prepare', 'SSP, signed packages, assessor workspace']];
  steps.forEach(([t, d], i) => { const x = 0.5 + i * 1.3; s.addShape(pres.ShapeType.ellipse, { x: x + 0.3, y: 1.35, w: 0.6, h: 0.6, fill: { color: i === 6 ? C.accent2 : C.accent1 } }); s.addText(String(i + 1), { x: x + 0.3, y: 1.35, w: 0.6, h: 0.6, fontSize: 16, bold: true, color: C.background1, align: 'center', valign: 'middle', margin: 0, isTextBox: true }); s.addText(t, { x, y: 2.05, w: 1.2, h: 0.4, fontSize: 13, bold: true, color: C.text2, align: 'center', margin: 0, isTextBox: true }); s.addText(d, { x, y: 2.45, w: 1.2, h: 1.0, fontSize: 10, color: C.accent3, align: 'center', margin: 0, isTextBox: true, valign: 'top' }); });
  s.addText([{ text: 'A US defence contractor that handles CUI has to meet the 110 requirements of NIST SP 800-171 and prove it to a CMMC Level 2 assessor. ', options: {} }, { text: 'BHD built the engines that touch a tenant; Aavya built the platform around them — portal, API, database, roles, approvals and the runner that carries work to Windows.', options: { bold: true } }], { x: 0.5, y: 3.7, w: 9, h: 1.2, fontSize: 14, color: C.text1, margin: 0, isTextBox: true, valign: 'top' });
  notes(s, 'The seven steps are also the seven sections of the sidebar. The split BHD/Aavya explains most of the design.'); }

// 3 who uses it
{ const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Introduction' });
  s.addText('Who uses it', { placeholder: 'title' });
  const roles = [['Org admin', 'runs the customer account; confirms the CUI boundary; manages users'], ['Compliance manager', 'does most of the work: runs assessments, plans, collects evidence, prepares the package'], ['IT security admin', 'runs monitoring; requests and executes AdminOps'], ['Evidence reviewer', 'second pair of eyes on evidence (never their own)'], ['Senior approver', 'approves POA&M, AdminOps and escalations'], ['Assessor', 'read-only workspace; asks for items'], ['BHD operator', 'Blue Heron’s engineer on the engagement: Stamper, runner, system health'], ['Platform admin', 'Blue Heron’s system owner — never sees customer data (PB-01)']];
  roles.forEach(([t, d], i) => { const col = i % 4, row = Math.floor(i / 4); const x = 0.5 + col * 2.3, y = 1.3 + row * 1.9; s.addShape(pres.ShapeType.roundRect, { x, y, w: 2.1, h: 1.7, fill: { color: C.background2 }, line: { color: C.background2 }, rectRadius: 0.08 }); s.addText(t, { x: x + 0.15, y: y + 0.12, w: 1.8, h: 0.4, fontSize: 14, bold: true, color: C.text2, margin: 0, isTextBox: true }); s.addText(d, { x: x + 0.15, y: y + 0.55, w: 1.8, h: 1.05, fontSize: 11, color: C.text1, margin: 0, isTextBox: true, valign: 'top' }); });
  notes(s, 'Roles are a single table used by the sidebar and the API. Route rules add the second-person checks.'); }

// 4 architecture
{ const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Introduction' });
  s.addText('How it is built — three boxes', { placeholder: 'title' });
  s.addImage({ path: path.join(__dirname, 'arch.png'), x: 0.5, y: 1.1, w: 9, h: 4.0, sizing: { type: 'contain', w: 9, h: 4.0 } });
  notes(s, 'Platform runs anywhere; the runner is Windows inside the customer boundary; the engines talk to the Microsoft cloud. Editable source: docs/architecture/ces-platform.drawio.'); }

// 5 why
{ const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Introduction' });
  s.addText('Why it is shaped this way', { placeholder: 'title' });
  const cards = [['Engines need Windows, the portal does not', 'BHD’s 201 registry reads and Stamper/AdminOps spawn powershell.exe. The platform stays OS-neutral; the Windows part is as thin as possible.'], ['The runner pulls, the platform never calls in', 'queue → claim → result over HTTPS: no inbound port at the customer, no platform credential that can reach a tenant. Runner off? Work queues.'], ['Postgres enforces tenancy', 'Every query sets the tenant id in its transaction; row-level security compares it; the app role cannot bypass it. A bug gets zero rows, not another tenant’s.'], ['One role table, used twice', 'Sidebar and API read the same matrix; a test fails if they drift. Second person, BHD-only and last-admin rules sit on the routes.'], ['Simulate first, live behind a gate', 'Live is refused unless the engagement has live access and a consent, re-checked at request, execute and claim.'], ['An empty read is not evidence', 'If every command failed on the host, nothing is recorded (engine_unavailable). The engine never credits what it could not read.']];
  cards.forEach(([t, d], i) => { const col = i % 3, row = Math.floor(i / 3); const x = 0.5 + col * 3.05, y = 1.25 + row * 1.95; s.addShape(pres.ShapeType.roundRect, { x, y, w: 2.9, h: 1.8, fill: { color: C.background2 }, line: { color: C.background2 }, rectRadius: 0.08 }); s.addText(t, { x: x + 0.15, y: y + 0.12, w: 2.6, h: 0.5, fontSize: 13, bold: true, color: C.text2, margin: 0, isTextBox: true, valign: 'top' }); s.addText(d, { x: x + 0.15, y: y + 0.62, w: 2.6, h: 1.1, fontSize: 10.5, color: C.text1, margin: 0, isTextBox: true, valign: 'top' }); });
  notes(s, 'Each of these is an ADR (doc 44). If a change needs one of them to bend, it needs an ADR first.'); }

// 6 assessment flow
{ const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Introduction' });
  s.addText('When someone presses Run assessment', { placeholder: 'title' });
  const steps = [['1', 'Compliance manager presses Run assessment', 'The API writes an engine job. On Windows it runs the engine in-process; elsewhere the job waits for a runner.'], ['2', 'The runner claims the job', 'PowerShell walks the 201 reads against the tenant (or simulator) and produces a readiness-result envelope plus raw captures.'], ['3', 'The API lands the result', 'Validates the envelope, writes the run and 110 results, computes SPRS, files each capture as draft evidence with its SHA-256.'], ['4', 'The portal takes over', 'Readiness, gaps, plan actions, remediation (simulate → approve → live), evidence review, SSP and packages, monitoring.']];
  steps.forEach(([n, t, d], i) => { const y = 1.25 + i * 0.98; s.addShape(pres.ShapeType.ellipse, { x: 0.5, y: y + 0.1, w: 0.55, h: 0.55, fill: { color: C.accent1 } }); s.addText(n, { x: 0.5, y: y + 0.1, w: 0.55, h: 0.55, fontSize: 16, bold: true, color: C.background1, align: 'center', valign: 'middle', margin: 0, isTextBox: true }); s.addText(t, { x: 1.25, y, w: 8.2, h: 0.35, fontSize: 15, bold: true, color: C.text2, margin: 0, isTextBox: true }); s.addText(d, { x: 1.25, y: y + 0.36, w: 8.2, h: 0.55, fontSize: 12, color: C.text1, margin: 0, isTextBox: true, valign: 'top' }); });
  notes(s, 'Unknown is honest: roughly 150 of 320 objectives need a document or a person; they stay unknown until then.'); }

// screens
let lastSection = '';
for (const sh of SHOTS) {
  if (sh.section !== lastSection) {
    lastSection = sh.section; pres.addSection({ title: sh.section });
    const d = pres.addSlide({ masterName: 'DARK', sectionTitle: sh.section });
    d.addText(sh.section, { placeholder: 'title' });
    const ids = SHOTS.filter((x) => x.section === sh.section).map((x) => `${x.n}. ${x.title}`).join('   ·   ');
    d.addText(ids, { placeholder: 'body' });
  }
  const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: sh.section });
  s.addText(`${sh.n}. ${sh.title}`, { placeholder: 'title' });
  const [w, h] = SIZES[sh.file]; const boxW = 5.9, boxH = 3.95; let iw = boxW, ih = boxW * h / w; if (ih > boxH) { ih = boxH; iw = boxH * w / h; }
  s.addImage({ path: path.join(CROP, sh.file), x: 0.5, y: 1.15, w: iw, h: ih });
  s.addShape(pres.ShapeType.rect, { x: 0.5, y: 1.15, w: iw, h: ih, fill: { type: 'none' }, line: { color: 'D0D7E2', width: 0.75 } });
  s.addText([{ text: 'Who  ', options: { bold: true, color: C.text2 } }, { text: sh.role, options: {} }], { x: 6.6, y: 1.15, w: 2.9, h: 0.55, fontSize: 11, color: C.text1, margin: 0, isTextBox: true, valign: 'top' });
  s.addText([{ text: 'Where  ', options: { bold: true, color: C.text2 } }, { text: sh.route, options: { fontFace: 'Courier New' } }], { x: 6.6, y: 1.7, w: 2.9, h: 0.35, fontSize: 10, color: C.text1, margin: 0, isTextBox: true });
  s.addText(sh.what, { x: 6.6, y: 2.1, w: 2.9, h: 1.45, fontSize: 11, color: C.text1, margin: 0, isTextBox: true, valign: 'top' });
  s.addText(sh.bullets.map((b, i) => ({ text: b, options: { bullet: true, breakLine: i < sh.bullets.length - 1 } })), { x: 6.6, y: 3.6, w: 2.9, h: 1.5, fontSize: 10.5, color: C.text1, margin: 0, isTextBox: true, valign: 'top', paraSpaceAfter: 4 });
  notes(s, `${sh.title} — ${sh.what}`);
}

// roles matrix
pres.addSection({ title: 'Reference' });
{ const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Reference' });
  s.addText('The permission matrix', { placeholder: 'title' });
  s.addText('V view · E edit · A approve · X execute — the same table the sidebar and the API use', { x: 0.5, y: 0.95, w: 9, h: 0.25, fontSize: 10.5, color: C.accent3, margin: 0, isTextBox: true });
  const head = ['Section', 'BHD op', 'Org admin', 'Compliance', 'IT sec admin', 'Ev. reviewer', 'Sr approver', 'Assessor'];
  const rows = [['Onboard', 'V E', 'V E A', 'V E', 'V E', 'V', 'V', ''], ['Assess', 'V E X', 'V', 'V E X A', 'V E X', 'V', 'V', ''], ['Plan', 'V E X', 'V A', 'V E A', 'V E', 'V', 'V A', ''], ['Remediate · Stamper', 'V E A X', '', '', '', '', '', ''], ['Remediate · AdminOps', 'V A X', 'V', 'V', 'V E X', '', 'V A', ''], ['Remediate · tracking', 'V E', 'V', 'V E', 'V E', 'V', 'V', ''], ['Collect Evidence', 'V E', 'V', 'V E', 'V E', 'V A', 'V', ''], ['Monitor', 'V E', 'V', 'V E', 'V E X', 'V', 'V A', ''], ['Prepare', 'V E', 'V', 'V E A', 'V', 'V', 'V', 'V'], ['Administration', 'V', 'V E', '', '', '', '', '']];
  const data = [head.map((t) => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: THEME.colors.dk2 }, fontSize: 10 } })), ...rows.map((r) => r.map((t, i) => ({ text: t, options: { fontSize: 10, bold: i === 0, color: THEME.colors.dk1, fill: { color: 'FFFFFF' } } })))];
  s.addTable(data, { x: 0.5, y: 1.3, w: 9, colW: [2.0, 0.95, 1.0, 1.1, 1.1, 1.05, 1.0, 0.8], border: { type: 'solid', color: 'D0D7E2', pt: 0.5 }, rowH: 0.3, fontFace: 'Calibri', margin: 0.04 });
  s.addText('Route rules on top: the requester never approves their own change (DP-2) · Stamper is BHD-only · the last org admin cannot be removed · platform admin is fenced off customer data (PB-01).', { x: 0.5, y: 4.7, w: 9, h: 0.45, fontSize: 10.5, color: C.accent3, margin: 0, isTextBox: true, valign: 'top' });
  notes(s, 'Source: muster-api/src/lib/permissions.ts and ces-muster/src/features/portal/lifecycle/rbac.ts — a parity test keeps them identical.'); }

// run it locally
{ const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Reference' });
  s.addText('Run it on your laptop', { placeholder: 'title' });
  const rows = [['Clone', 'git clone -c core.autocrlf=false https://github.com/aavya-engineering/CES.git C:\\ces'], ['Install', 'npm ci in four trees: root · ces-muster · ces-muster\\muster-api · tenant-stacksim'], ['Database', 'Postgres 16 · migrate as postgres · scripts\\bootstrap-app-role.sql (least-privilege app role)'], ['Configure', '.env from .env.example: DATABASE_URL (app role), JWT_SECRET'], ['Seed', 'npm run seed:dev:win — demo accounts, password Ces!Local2026'], ['Run', 'API npm run dev (:4000) · portal npm run dev (:5173) · simulator npm run sim (:4390) · runner npm run runner'], ['Verify', 'npm run smoke:postgres · CES_E2E_LIVE=1 npm run test:e2e:live']];
  rows.forEach(([a, b], i) => { const y = 1.2 + i * 0.5; s.addText(a, { x: 0.5, y, w: 1.4, h: 0.45, fontSize: 13, bold: true, color: C.text2, margin: 0, isTextBox: true, valign: 'middle' }); s.addText(b, { x: 1.9, y, w: 7.6, h: 0.45, fontSize: 11, fontFace: 'Courier New', color: C.text1, margin: 0, isTextBox: true, valign: 'middle' }); });
  s.addText('Only one thing cannot work on macOS/Linux: Run assessment — the registry reads are Windows PowerShell, so the job queues for a Windows runner. Full guide: docs/DEV-SETUP-WINDOWS.md.', { x: 0.5, y: 4.75, w: 9, h: 0.45, fontSize: 10.5, color: C.accent3, margin: 0, isTextBox: true, valign: 'top' });
  notes(s, 'Troubleshooting table with every error we hit is at the end of DEV-SETUP-WINDOWS.md.'); }

// training
{ const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Reference' });
  s.addText('New engineer: five days to a first PR', { placeholder: 'title' });
  const days = [['Day 1', 'Run it; click through as four roles', 'smoke green · sign in · one action per role · three confusions written down'], ['Day 2', 'The user journeys J1–J5', 'draw the sidebar from memory; who can do what; check against rbac.ts'], ['Day 3', 'Read the code the way it runs', 'trace Run assessment UI → proxy → guards → route → PowerShell → DB; then a Stamper run'], ['Day 4', 'Engine, runner, Windows', 'runner --once on Mac (fails honestly) and Windows (done); CES_ENGINE_LOCAL=0; read poll.ts'], ['Day 5', 'Ship a change', 'test first · browser check · PR · CI · doc in the same PR · graduation: guard one legacy router']];
  days.forEach(([d, t, w], i) => { const x = 0.5 + i * 1.84; s.addShape(pres.ShapeType.roundRect, { x, y: 1.25, w: 1.7, h: 3.6, fill: { color: i === 4 ? C.accent2 : C.background2 }, line: { color: i === 4 ? C.accent2 : C.background2 }, rectRadius: 0.08 }); s.addText(d, { x: x + 0.12, y: 1.37, w: 1.5, h: 0.35, fontSize: 14, bold: true, color: i === 4 ? C.background1 : C.text2, margin: 0, isTextBox: true }); s.addText(t, { x: x + 0.12, y: 1.75, w: 1.5, h: 0.8, fontSize: 12, bold: true, color: i === 4 ? C.background1 : C.text1, margin: 0, isTextBox: true, valign: 'top' }); s.addText(w, { x: x + 0.12, y: 2.6, w: 1.5, h: 2.1, fontSize: 10, color: i === 4 ? C.background1 : C.text1, margin: 0, isTextBox: true, valign: 'top' }); });
  notes(s, 'Long form with file-by-file traces and exercises: docs/NEW-JOINER-TRAINING.md.'); }

// open items
{ const s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Reference' });
  s.addText('What is proven, what is next', { placeholder: 'title' });
  const left = ['Lifecycle end to end on the simulator (Mac): smoke, browser walk 5/5, runner round trip', 'Role matrix server-side with parity test and path-bypass probes', 'Tenant isolation by Postgres RLS; API refuses a superuser', 'Evidence catalog release 0 with batch validator', 'Per-tenant module visibility (Settings › Modules) for demos and phased roll-out', 'Threat model (STRIDE) and a security review; High finding fixed', 'CI: unit suites + Postgres smoke + dependency gate'];
  const right = ['Run assessment on a Windows host (first real engine proof)', 'Dedicated runner identity and signed results', 'MFA / SSO — BHD’s choice', 'Live discovery grants on the runner; kit CLI for live Stamper/AdminOps', 'A BHD test tenant in GCC High for live runs', 'Legacy routers under the matrix guard; token revocation on disable'];
  s.addText('Done', { x: 0.5, y: 1.15, w: 4.3, h: 0.4, fontSize: 16, bold: true, color: C.accent4, margin: 0, isTextBox: true });
  s.addText(left.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < left.length - 1 } })), { x: 0.5, y: 1.6, w: 4.3, h: 3.4, fontSize: 12, color: C.text1, margin: 0, isTextBox: true, valign: 'top', paraSpaceAfter: 6 });
  s.addText('Next', { x: 5.2, y: 1.15, w: 4.3, h: 0.4, fontSize: 16, bold: true, color: C.accent2, margin: 0, isTextBox: true });
  s.addText(right.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < right.length - 1 } })), { x: 5.2, y: 1.6, w: 4.3, h: 3.4, fontSize: 12, color: C.text1, margin: 0, isTextBox: true, valign: 'top', paraSpaceAfter: 6 });
  notes(s, 'Detail and owners: production readiness plan (doc 50), security review (doc 49), runner and walk (doc 47).'); }

// closing
{ const s = pres.addSlide({ masterName: 'DARK', sectionTitle: 'Reference' });
  s.addText('Where to find things', { placeholder: 'title' });
  s.addText('docs/USER-GUIDE.md · docs/NEW-JOINER-TRAINING.md · docs/DEV-SETUP-WINDOWS.md · docs/architecture/ces-platform.drawio\nAPI reference: /api/docs on a running API · permission matrix: lifecycle/rbac.ts = lib/permissions.ts\nSDLC set (PRD, FRS, SRS, HLD v2, LLD v2, tests, threat model, security review, ADRs): Aavya project “CES-BlueHeron”', { placeholder: 'body' }); }

(async () => {
  const out = path.join(__dirname, 'CES-Platform-Walkthrough.pptx');
  await pres.writeFile({ fileName: out });
  await applyTheme(out, THEME);
  console.log('pptx written');
})();
