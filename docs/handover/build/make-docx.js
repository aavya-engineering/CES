const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, Table, TableRow, TableCell, WidthType, AlignmentType,
  PageBreak, TableOfContents, LevelFormat, BorderStyle, ShadingType, Header, Footer, PageNumber, TabStopType,
} = require('docx');

const SHOTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'screens.json'), 'utf8'));
const CROP = path.join(__dirname, 'crop');
const { imageSize } = (() => { try { return require('image-size'); } catch { return {}; } })();
const sizeOf = (f) => { const b = fs.readFileSync(f); // jpg/png size via PIL-precomputed json
  const meta = JSON.parse(fs.readFileSync(path.join(__dirname, 'sizes.json'), 'utf8')); return meta[path.basename(f)]; };

const NAVY = '1E2761', INK = '1F2937', MUTED = '5B6470', LINE = 'D0D7E2', TINT = 'EEF3FA';
const FONT = 'Calibri', HFONT = 'Cambria';

const p = (text, opts = {}) => new Paragraph({ spacing: { after: 120, line: 276 }, ...opts.para, children: [new TextRun({ font: FONT, size: 22, color: INK, text, ...opts.run })] });
const runs = (parts, para = {}) => new Paragraph({ spacing: { after: 120, line: 276 }, ...para, children: parts.map((x) => typeof x === 'string' ? new TextRun({ font: FONT, size: 22, color: INK, text: x }) : new TextRun({ font: FONT, size: 22, color: INK, ...x })) });
const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: t })] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: t })] });
const h3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text: t })] });
const bullet = (t) => new Paragraph({ numbering: { reference: 'bul', level: 0 }, spacing: { after: 60, line: 276 }, children: [new TextRun({ font: FONT, size: 22, color: INK, text: t })] });
const num = (t) => new Paragraph({ numbering: { reference: 'num', level: 0 }, spacing: { after: 60, line: 276 }, children: [new TextRun({ font: FONT, size: 22, color: INK, text: t })] });
const muted = (t) => p(t, { run: { color: MUTED, size: 20, italics: true } });
const code = (t) => new Paragraph({ spacing: { after: 100 }, shading: { type: ShadingType.CLEAR, fill: 'F3F4F6', color: 'auto' }, children: [new TextRun({ font: 'Courier New', size: 19, color: INK, text: t })] });
const br = () => new Paragraph({ children: [new PageBreak()] });

function img(file, widthIn = 6.5) {
  const f = path.join(CROP, file);
  const [w, h] = sizeOf(f);
  const W = Math.round(widthIn * 96); const H = Math.round(h * W / w);
  return new Paragraph({ spacing: { before: 60, after: 160 }, alignment: AlignmentType.CENTER, children: [new ImageRun({ type: file.endsWith('.png') ? 'png' : 'jpg', data: fs.readFileSync(f), transformation: { width: W, height: H }, altText: { title: file, description: file, name: file } })] });
}

function table(headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const cell = (t, head, w) => new TableCell({ width: { size: w, type: WidthType.DXA }, shading: head ? { type: ShadingType.CLEAR, fill: NAVY, color: 'auto' } : undefined, margins: { top: 60, bottom: 60, left: 100, right: 100 }, children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ font: FONT, size: 19, bold: head, color: head ? 'FFFFFF' : INK, text: t })] })] });
  return new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: widths, borders: { top: { style: BorderStyle.SINGLE, size: 4, color: LINE }, bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE }, left: { style: BorderStyle.SINGLE, size: 4, color: LINE }, right: { style: BorderStyle.SINGLE, size: 4, color: LINE }, insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: LINE }, insideVertical: { style: BorderStyle.SINGLE, size: 4, color: LINE } },
    rows: [new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, true, widths[i])) }), ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, false, widths[i])) }))] });
}

const children = [];
// ---------------- cover
children.push(new Paragraph({ spacing: { before: 2400, after: 200 }, children: [new TextRun({ font: HFONT, size: 56, bold: true, color: NAVY, text: 'CES — Compliance Evidence System' })] }));
children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ font: HFONT, size: 32, color: INK, text: 'User guide, screen by screen · Architecture · New-joiner training' })] }));
children.push(new Paragraph({ spacing: { after: 1200 }, children: [new TextRun({ font: FONT, size: 22, color: MUTED, text: 'Aavya Engineering for Blue Heron Defense · platform state: master, 12 November 2026 · demo data only (Contoso Defense, simulator tenant)' })] }));
children.push(img('../arch-preview.png', 6.5));
children.push(muted('Figure 1 — the as-built platform. Editable source: docs/architecture/ces-platform.drawio (draw.io).'));
children.push(br());

// ---------------- TOC
children.push(h1('Contents'));
children.push(new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-2' }));
children.push(muted('If the table is empty, right-click it and choose Update Field (Word builds it on open).'));
children.push(br());

// ---------------- Part 1
children.push(h1('1. What CES is, in one page'));
children.push(p('A US defence contractor that handles Controlled Unclassified Information (CUI) has to meet the 110 security requirements of NIST SP 800-171 and prove it to a CMMC Level 2 assessor. CES walks a contractor through that, end to end, in seven steps that are also the seven sections of the portal:'));
[['Onboard', 'who the customer is, which tenants and systems are in scope, where the CUI boundary sits'],
 ['Assess', 'read the Microsoft 365 / Azure tenant against the requirements and score it (SPRS)'],
 ['Plan', 'turn gaps into owned, dated actions and a POA&M'],
 ['Remediate', 'fix configuration and admin settings with approvals, simulate first, live only behind a gate'],
 ['Collect Evidence', 'gather and review the artefacts an assessor will ask for'],
 ['Monitor', 'keep it fixed: evaluate, raise findings, track drift'],
 ['Prepare', 'SSP statements, signed evidence packages, and a read-only assessor workspace']].forEach(([a, b]) => children.push(runs([{ text: a + ' — ', bold: true }, b], { numbering: { reference: 'bul', level: 0 }, spacing: { after: 60 } })));
children.push(p('Blue Heron Defense built the engines that touch a tenant (PowerShell, Microsoft Graph). Aavya built the platform around them: the portal, the API, the database, the roles and approvals, and the runner that carries work to the Windows machine where the engines live. One sentence explains most of the design: the engines need Windows, the rest does not.'));
children.push(h2('Words you will hear'));
children.push(table(['Term', 'Meaning'], [
  ['Requirement', 'One of the 110 NIST SP 800-171 requirements, e.g. AC.L2-3.1.1'],
  ['Objective', 'One of the 320 assessment objectives under them (NIST 800-171A)'],
  ['SPRS', 'The score reported to DoD, from −203 to 110; only met requirements count'],
  ['Engagement', 'One customer\u2019s assessment cycle'],
  ['Tenant', 'The customer\u2019s Microsoft 365 / Azure (GCC or GCC High)'],
  ['Simulator', 'tenant-stacksim — a fake tenant used for demos and tests'],
  ['Runner', 'The Windows process that executes engine work for the platform'],
  ['Stamper / AdminOps', 'BHD\u2019s engines: configuration changes / governed admin operations'],
  ['DP-2', 'Two-person rule: the person who requests a change cannot approve it'],
  ['PB-01 / PB-02', 'Platform admin sees no customer data / no secrets in run parameters, logs or responses'],
], [2200, 7160]));
children.push(br());

// ---------------- Part 2 architecture
children.push(h1('2. How it is built'));
children.push(p('Three boxes. A platform that runs anywhere Node and Postgres run — the portal people click, the API behind it, the database — and holds the state of every engagement. A tenant runner that must run on Windows next to the customer\u2019s tenant, because the engines are PowerShell; it has no state of its own, it pulls work from the platform and pushes results back. And the customer\u2019s Microsoft cloud, which only the runner ever touches, and only in read mode unless a person has approved a change.'));
children.push(img('../arch-preview.png', 6.5));
children.push(muted('Figure 2 — as-built architecture (docs/architecture/ces-platform.drawio).'));
children.push(h2('Why it is shaped this way'));
[['The engines need Windows and the portal does not.', 'BHD\u2019s registry of 201 read commands and the Stamper/AdminOps engines spawn powershell.exe and read the Windows certificate store; their kit says Linux is unsupported. So the platform is OS-neutral and the Windows part is as thin as possible.'],
 ['The runner pulls; the platform never calls in.', 'A customer\u2019s Windows host is behind their firewall. Queue → claim → result over HTTPS needs no inbound port and no platform credential that can reach a tenant. If the runner is off, work queues; nothing is lost.'],
 ['Postgres enforces tenancy.', 'Every query runs in a transaction that sets the tenant id; row-level security compares it; the app role cannot bypass RLS and the API refuses to start as a superuser. A bug in a route gets zero rows, not another tenant\u2019s rows.'],
 ['One role table, used twice.', 'The sidebar and the API read the same matrix (section × role → view / edit / approve / execute). A test fails if they drift. Route rules add what a matrix cannot say: second person, BHD-only, last org admin.'],
 ['Simulate first, live behind a gate.', 'Live mode is refused unless the engagement has live access on and a consent exists, re-checked at request, execute and claim. The portal only shows what the API will allow.']].forEach(([a, b]) => children.push(runs([{ text: a + ' ', bold: true }, b])));
children.push(h2('What flows where'));
children.push(num('A compliance manager presses Run assessment. The API writes an engine job. On Windows it runs the engine in-process; elsewhere the job waits for a runner.'));
children.push(num('The runner claims it; PowerShell walks the 201 reads against the tenant (or simulator) and produces a readiness-result envelope — 110 requirements, 320 objectives, met / not met / unknown — plus the raw captures that justify each read.'));
children.push(num('The API validates the envelope, writes the run and results, computes SPRS, and files each capture as draft evidence with its SHA-256. If every command failed on the host, nothing is recorded: an empty read is not evidence.'));
children.push(num('From there the portal: gaps → plan actions → remediation (simulate, approve, live) → evidence review → SSP and packages → monitoring.'));
children.push(muted('Detail: HLD v2 (doc 04 v2) and LLD v2 (doc 05 v2) in the Aavya project — routes, tables, state machines, runner protocol, error codes.'));
children.push(br());

// ---------------- Part 3 roles
children.push(h1('3. Roles and what each can do'));
children.push(p('The table is the permission matrix the sidebar and the API both use (V = view, E = edit, A = approve, X = execute). Blank means the section is not shown. Route rules apply on top: the requester never approves their own change; Stamper is BHD-only; the last org admin cannot be removed.'));
children.push(table(['Section', 'BHD operator', 'Org admin', 'Compliance mgr', 'IT security admin', 'Evidence reviewer', 'Senior approver', 'Assessor'], [
  ['Onboard', 'V E', 'V E A', 'V E', 'V E', 'V', 'V', ''],
  ['Assess', 'V E X', 'V', 'V E X A', 'V E X', 'V', 'V', ''],
  ['Plan', 'V E X', 'V A', 'V E A', 'V E', 'V', 'V A', ''],
  ['Remediate · Stamper', 'V E A X', '', '', '', '', '', ''],
  ['Remediate · AdminOps', 'V A X', 'V', 'V', 'V E X', '', 'V A', ''],
  ['Remediate · tracking', 'V E', 'V', 'V E', 'V E', 'V', 'V', ''],
  ['Collect Evidence', 'V E', 'V', 'V E', 'V E', 'V A', 'V', ''],
  ['Monitor', 'V E', 'V', 'V E', 'V E X', 'V', 'V A', ''],
  ['Prepare', 'V E', 'V', 'V E A', 'V', 'V', 'V', 'V'],
  ['Administration', 'V', 'V E', '', '', '', '', ''],
], [1700, 1050, 950, 1100, 1100, 1050, 1000, 900]));
children.push(muted('Platform admin (BHD\u2019s system owner) administers platform users and the audit log and is fenced off customer data (PB-01).'));
children.push(h2('Demo accounts (local development only)'));
children.push(p('Password for every account: Ces!Local2026. Created by npm run seed:dev (Mac/Linux) or npm run seed:dev:win (Windows). Never run the seed against a shared database.'));
children.push(table(['Account', 'Tenant', 'Role'], [
  ['admin@bhd.local', 'Blue Heron Defense', 'platform admin'], ['operator@bhd.local', 'Blue Heron Defense', 'BHD operator'],
  ['bhd-ops1@contoso.local · bhd-ops2@contoso.local', 'Contoso Defense (demo)', 'BHD operator (two, for the second-person rule)'],
  ['runner@contoso.local', 'Contoso Defense (demo)', 'BHD operator — the account the Windows runner polls with'],
  ['orgadmin@contoso.local', 'Contoso Defense (demo)', 'org admin'], ['compliance@contoso.local', 'Contoso Defense (demo)', 'compliance manager'],
  ['itsec@contoso.local', 'Contoso Defense (demo)', 'IT security admin'], ['reviewer@contoso.local', 'Contoso Defense (demo)', 'evidence reviewer'],
  ['approver@contoso.local', 'Contoso Defense (demo)', 'senior approver'], ['assessor@c3pao.local', 'Contoso Defense (demo)', 'assessor (read-only)'],
], [3600, 2600, 3160]));
children.push(br());

// ---------------- Part 4 screens
children.push(h1('4. The portal, screen by screen'));
children.push(p('Screens appear in the order a customer meets them. The role line says who sees the actions; if you do not see a button, your role does not have it — that is not a bug. Screenshots are from the demo tenant on 11–12 November 2026.'));
let lastSection = '';
for (const s of SHOTS) {
  if (s.section !== lastSection) { children.push(h2(s.section)); lastSection = s.section; }
  children.push(h3(`${s.n}. ${s.title}`));
  children.push(runs([{ text: 'Who: ', bold: true }, s.role, { text: '   Where: ', bold: true }, { text: s.route, font: 'Courier New', size: 20 }], { keepNext: true }));
  children.push(p(s.what, { para: { keepNext: true } }));
  s.bullets.forEach((b) => children.push(new Paragraph({ numbering: { reference: 'bul', level: 0 }, keepNext: true, spacing: { after: 60, line: 276 }, children: [new TextRun({ font: FONT, size: 22, color: INK, text: b })] })));
  children.push(img(s.file, 6.5));
  children.push(muted(`Figure ${s.n + 2} — ${s.title} (${s.role}).`));
}
children.push(br());

// ---------------- Part 5 run locally
children.push(h1('5. Run it yourself'));
children.push(p('The full developer setup is docs/DEV-SETUP-WINDOWS.md in the repository (Windows 10/11; the same steps work on macOS with the .sh scripts). In short:'));
[['Clone', 'git clone -c core.autocrlf=false https://github.com/aavya-engineering/CES.git C:\\ces'],
 ['Install (four trees)', 'npm ci at the root, in ces-muster, in ces-muster\\muster-api and in tenant-stacksim'],
 ['Database', 'Postgres 16 (Docker: postgres:16); migrate as postgres, then scripts\\bootstrap-app-role.sql creates the least-privilege app role'],
 ['Configure', 'copy muster-api\\.env.example to .env: DATABASE_URL (app role), JWT_SECRET'],
 ['Seed', 'npm run seed:dev:win — the demo accounts above'],
 ['Run', 'API: npm run dev (:4000) · portal: npm run dev (:5173) · simulator: npm run sim at the root (:4390) · optional runner: npm run runner'],
 ['Verify', 'npm run smoke:postgres (every lifecycle slice against the real database) · CES_E2E_LIVE=1 npm run test:e2e:live (the browser walk)']].forEach(([a, b]) => children.push(runs([{ text: a + ': ', bold: true }, { text: b, font: 'Courier New', size: 20 }])));
children.push(p('Only one thing cannot work on macOS or Linux: Run assessment. The registry\u2019s read commands are Windows PowerShell, so on those hosts the job queues for a Windows runner instead.'));
children.push(br());

// ---------------- Part 6 training
children.push(h1('6. New-joiner training — five days'));
children.push(p('For an engineer joining the CES work. Each day ends with something you can show. The long form, with exercises and file-by-file traces, is docs/NEW-JOINER-TRAINING.md.'));
[['Day 1 — Run it and click through', 'Set up from section 5 until the smoke passes and you can sign in. Then sign in as org admin, compliance manager, BHD operator 1 and BHD operator 2 and do one thing each: look at the boundary and, in Settings › Modules, hide Monitor and watch it leave the sidebar (then put it back); press Run assessment and open the NIST catalog; request a get-only Stamper simulate run; execute it as the second operator. Write down three things that confused you.'],
 ['Day 2 — The user journeys', 'J1 Where do we stand (Onboard → Assess → Gaps). J2 Fix it (Plan → Remediate; try live mode and read the refusal). J3 Prove it (Collect → review as reviewer → SSP → package → sign-off by a second compliance manager → assessor view). J4 Keep it that way (Monitor: evaluate as IT security admin, alerts, activity). J5 Run the shop (Settings, Access, System health as BHD). By the end, draw the sidebar from memory and name who can do what — then check against lifecycle/rbac.ts.'],
 ['Day 3 — Read the code the way it runs', 'Trace one request: AssessPages.tsx → assessApi.ts → vite proxy → app.ts (bearerAuth → requireAction → router) → routes/assessments.ts POST /run → services/simDiscoveryRun.ts → liveSimSession.ts (powershell.exe) → landEnvelope → runCaptures.ts → lib/prisma.ts withTenant. Then trace Stamper request → approve → execute on your own and write the chain down. Exercise: pick any route in app.ts, say who can call it, what it writes, what it audits, and prove the first with a one-line denial probe in tests/roleMatrix.test.ts.'],
 ['Day 4 — The engine, the runner and Windows', 'Read ADR-02. Start the runner with --once against a queued job on a Mac (it ends failed engine_unavailable — correct) and on Windows (it ends done with a run and evidence). Start the API with CES_ENGINE_LOCAL=0 to force the queue on Windows and watch the runner pick jobs up. Read src/runner/poll.ts (100 lines; every branch has a test). Exercise: run the lifecycle walk on Windows and add one assertion.'],
 ['Day 5 — Ship a change the way we ship', 'Small branch from master; test first (mockDb for API, smoke for RLS, Playwright for UI); open it in the browser against the real API before calling it done; commit messages say why; PR; read the CI yourself; update the doc that describes the behaviour in the same PR. Graduation: add the role-matrix guard to one legacy router (/api/plan) with a denial probe, and open the PR.']].forEach(([a, b]) => { children.push(h2(a)); children.push(p(b)); });
children.push(h2('Things we never do without an explicit yes'));
['Push to master directly or deploy to the demo server', 'Touch a real tenant', 'Add dependencies with native builds; run npm install instead of npm ci', 'Put a credential anywhere the platform stores run parameters, logs or responses'].forEach((t) => children.push(bullet(t)));
children.push(br());

// ---------------- Part 7 troubleshooting
children.push(h1('7. When something looks wrong'));
children.push(table(['What you see', 'What it means', 'What to do'], [
  ['"Your role cannot do this" on a page you can see', 'Sidebar and API share one matrix, but one page shows for a role the API fences (System health for platform admin)', 'Use the role the page is for; decision pending with BHD'],
  ['Run assessment stays Queued…', 'The platform is not on Windows (or CES_ENGINE_LOCAL=0) and no runner is polling', 'Start the runner on the Windows host; check System health → last runner claim'],
  ['Run assessment fails: engine_unavailable', 'All registry commands failed on that host — PowerShell missing', 'Run on Windows; nothing was recorded, by design'],
  ['Run assessment fails: sim_unreachable', 'The simulator is not serving muster-partial on :4390', 'npm run sim at the repo root'],
  ['Approve button missing on a run you requested', 'Second-person rule (DP-2)', 'A different BHD operator / approver approves'],
  ['Evidence content empty in a list', 'Lists never load content', 'Open the item'],
  ['403 ROLE_MATRIX in the API log', 'The role matrix said no — scope and action are in the response', 'Check lifecycle/rbac.ts for who can'],
  ['Zero rows where you expect data', 'A query outside withTenant, or signed in to another tenant', 'Both are correct behaviour; fix the code or the account'],
  ['Five wrong passwords', 'Account paused for 15 minutes', 'Wait; the message says how long'],
], [3000, 3400, 2960]));
children.push(h2('Where things are'));
children.push(table(['Thing', 'Place'], [
  ['Developer setup', 'docs/DEV-SETUP-WINDOWS.md'], ['This guide (Markdown)', 'docs/USER-GUIDE.md'], ['Training (long form)', 'docs/NEW-JOINER-TRAINING.md'],
  ['Architecture diagram (editable)', 'docs/architecture/ces-platform.drawio'], ['Permission matrix', 'ces-muster/src/features/portal/lifecycle/rbac.ts = muster-api/src/lib/permissions.ts'],
  ['API reference', 'GET /api/docs on a running API (OpenAPI)'], ['Runner', 'ces-muster/muster-api/src/runner (npm run runner)'],
  ['SDLC set (PRD, FRS, SRS, HLD v2, LLD v2, tests, threat model, security review, ADRs)', 'Aavya Claude project "CES-BlueHeron", claude/ces-sdlc/'],
], [3600, 5760]));

const doc = new Document({
  creator: 'Aavya Engineering', title: 'CES — User guide, architecture and training', description: 'Screen-by-screen user guide, architecture and new-joiner training for the CES platform',
  styles: {
    default: { document: { run: { font: FONT, size: 22, color: INK } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: HFONT, size: 36, bold: true, color: NAVY }, paragraph: { spacing: { before: 360, after: 160 }, keepNext: true, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: HFONT, size: 28, bold: true, color: NAVY }, paragraph: { spacing: { before: 280, after: 120 }, keepNext: true, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 24, bold: true, color: INK }, paragraph: { spacing: { before: 240, after: 80 }, keepNext: true, outlineLevel: 2 } },
    ],
  },
  numbering: { config: [
    { reference: 'bul', levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
    { reference: 'num', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 360 } } } }] },
  ] },
  features: { updateFields: true },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
    headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun({ font: FONT, size: 18, color: MUTED, text: 'CES — Compliance Evidence System · user guide, architecture and training · Aavya for Blue Heron Defense · demo data only' })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ font: FONT, size: 18, color: MUTED, children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES] })] })] }) },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(path.join(__dirname, 'CES-User-Guide-and-Training.docx'), buf); console.log('docx written', buf.length); });
