# 08 v2 — CES User Guide (screen by screen)

This replaces the October user guide (kept as `08-user-guide.md` for history). It describes the portal as it is on `master` today, screen by screen, in the order a customer meets them. Role names in brackets say who sees the action; if you don't see a button, it is because your role doesn't have it — not a bug.

Roles, in plain words: **org admin** (runs the customer's account), **compliance manager** (does most of the work), **IT security admin** (approves admin operations), **evidence reviewer** (second pair of eyes on evidence), **senior approver** (approves POA&M, admin operations and escalations), **assessor** (read-only, asks for things), **BHD operator** (Blue Heron's engineer on your engagement), **platform admin** (Blue Heron's system owner — never sees customer data).

---

## Signing in

Email and password; "remember me" keeps you signed in on this browser. A temporary password forces a change on first sign-in. Forgot it? The link sends a reset e-mail (in the demo build it prints to the API log). Five wrong passwords in 15 minutes and the account waits — the message tells you how long.

Top right: your account menu (change password, sign out) and Help. Left: the sidebar, grouped by lifecycle section. Breadcrumbs under the title tell you where you are. Most pages have an **engagement picker** at the top — everything on the page is about that engagement.

---

## Onboard

**Organizations** — the customer's legal entities. [org admin] *Create organization*: legal name and the basics; the table lists what exists.

**Tenants** — the Microsoft 365 / Azure tenants in scope. [org admin] *Register tenant*: name and identifiers; *Connection checks* shows whether the platform can reach it (in the demo this points at the simulator).

**Scope** — the CUI boundary: which systems and assets handle CUI. [compliance manager] drafts the boundary (asset name, category: CUI / SPA / CRMA / Specialized / Out of scope); [org admin] *Confirm* a version. Confirming is a formal act — it is what the assessor will see as "what you said was in scope" — so only the org admin can do it, and every version is kept.

**Systems inventory** — the systems and environments registry (name, environment, owner). [compliance manager, org admin] add; everyone reads.

**Onboarding checklist** — the summary of what is done and what is still missing before assessment makes sense. No actions; it tells you where to go.

---

## Assess

**Readiness** — the main screen. Pick the engagement, pick a run (newest first). The family table shows, for each of the 14 control families, how many of its requirements are met / not met / unknown, and the SPRS score for the run.

*Run assessment* [compliance manager, IT security admin, BHD operator] starts a new read of the tenant against the simulator or, on a live-enabled engagement, the real tenant. What you see on the button:

- *Engine running…* — the engine is reading now (platform on Windows).
- *Queued…* — the job is waiting for the Windows runner; it will turn into a run when the runner picks it up. If it stays queued, the runner is not running — tell BHD.
- An error — the message says why (`ENGINE_NEEDS_WINDOWS`, `sim_unreachable`, `engine_unavailable` = all commands failed on that host).

*Import* lets a BHD operator load a readiness result file produced elsewhere. *Run history* lists every run with its source (`engine_run`, `import`, `interview`).

Two things to know: unknown is honest. Roughly 150 of the 320 objectives are things a machine cannot see (policies, training, physical controls); they stay *unknown* until evidence or a person settles them. And nothing here changes the tenant — assessment is read-only.

**Gaps** — every requirement that is not met or unknown, heaviest first (weights are the SPRS weights, 1/3/5). *Export* gives a CSV. Open a gap for the objectives behind it. *Override* [compliance manager, BHD operator]: set the status by hand with a reason (at least ten characters). Overrides are recorded with your name and shown as such — assessors ask about them.

---

## Plan

**Overview** — counts by priority and status.

**Actions** — one row per thing to do. [compliance manager] create (title, requirement, owner, priority, due date, fix kind — *registry* means Stamper can do it automatically), move through *open → in progress → done / won't fix*. Export CSV.

**POA&M** — the Plan of Action & Milestones the assessor expects: weakness, mitigation, milestones with dates, whether a POA&M is allowed for that requirement (some are not — the row says NO). [compliance manager] edit; [org admin, compliance manager, senior approver] approve.

---

## Remediate

**Overview** — every remediation run across both engines: when, who requested, module, mode (*simulate* / *live*), cost estimate, gate status, run status. *Open* shows the run drawer: gates (OK / BLOCKED / Note with the reason), the result, and the actions your role has.

Run statuses, in order: *Awaiting approval* → *Approved* → (*Queued for runner* → *Running*, live only) → *Finished — verify* or *Failed* → *Verified*. Also *Rejected*, *Blocked by gate*, *Cancelled*.

**Stamper** [BHD operator only] — configuration changes from BHD's registry. Pick entries (the table shows `get` = read-only check, `set` = changes something, *HELD · manual* = cannot be automated), or start from a registry-fixable plan action which pre-selects its entries. Choose *Simulate* or *Live*, write a justification (ten characters minimum), *Request*. The preview card shows the gates. A run with only `get` entries is approved on request; any `set` entry needs a **second** BHD operator to approve (the requester sees "You requested this — a different person must approve it"). *Execute* records the simulated plan or, in live mode, queues the run for the Windows runner; nothing touches the tenant in simulate mode, ever.

**AdminOps** [compliance manager, IT security admin, BHD operator request; IT security admin / senior approver / BHD approve] — governed admin operations by domain (Identity & Access, Devices, Credentials, Data Protection, Audit, …). Pick an operation, fill its parameters (never a secret — the platform refuses to store them), justify, *Request*. Same approval and execute flow. Other customer roles see the queue but cannot request.

**Verify** [compliance manager, BHD operator] — after a run finishes, a person confirms the outcome with notes. Verified runs close their plan action. The engine never verifies itself.

---

## Collect Evidence

**Overview** — counts by status (draft, submitted, approved, rejected) and by source.

**Explorer** — every evidence item: title, requirement(s), objective(s), source (*discovery* from an assessment run, *stamper* / *adminops* from remediation runs, *manual* uploads), SHA-256, size, status. Open one for the content preview, who created and reviewed it, and the run it came from.

**Collect** [compliance manager, IT security admin, BHD operator] — upload a file or paste text; choose requirement and objectives; optionally pick a **catalog definition** (what the assessor expects for that requirement — today the catalog covers AC.L2-3.1.1; more arrives from BHD in batches). *Submit* for review.

**Review** [evidence reviewer] — approve or reject with a note. You cannot review what you submitted yourself; the page says so.

**NIST evidence catalog** — read-only reference: per requirement, the 800-171A examine items and the evidence definitions (form ids, what to collect, which objectives it satisfies). Use it to know what to gather before the assessor asks.

---

## Monitor

**Overview** — the compliance posture over time: findings open/acknowledged/resolved, last evaluation, drift since the last assessment. *Evaluate now* [IT security admin] runs the checks. When BHD switches the scheduler on, this happens on the cadence set in Administration › Settings.

**Alerts** — findings by family and status. Open one to *Acknowledge* (with notes), *Resolve* or *Escalate* [resolve/escalate: senior approver].

**Activity** — the audit trail for this engagement: who did what, when, filterable by text. This is your answer to "who changed that".

---

## Prepare for assessment

**Overview** — the readiness checklist for the package: boundary confirmed, assessment run exists, POA&M present, evidence coverage, SSP statements, sign-offs.

**SSP** — one row per requirement: implementation statement (draft → approved), linked evidence. *Generate* fills statements from the assessment and evidence; *Export MD* gives the document. [compliance manager edits and approves statements — approving is a separate click from editing.]

**Packages** — build an evidence package for a scope (all, a family, a requirement list): *Build* → *Validate* → *Sign off* [compliance manager; the person who built the package cannot sign it — a second compliance manager or BHD does]. Versions are kept; a signed package is immutable.

**Assessor workspace** — what the assessor sees: the package, read-only, and a request list. [assessor] *Ask* for an item; [compliance manager] answers with evidence or a note.

**Reports** — readiness, coverage, gaps, SPRS, POA&M, evidence inventory as JSON / Markdown / CSV.

---

## Administration

**Settings** [org admin edit; others view] — engagement details (name, reference, CMMC level, status, dates), monitoring cadence, notification settings. Some settings are recorded but not yet enforced by the platform; the tab says which (open decision with BHD).

**Access** — *Requests*: anyone can request a role; [org admin] decides. *Reviews*: periodic access reviews — start one, decide per user, complete; the completion must be attested by a different admin. *Users* [org admin]: create users in your organisation with customer roles only (never platform or BHD roles), reset passwords (a temporary one is shown once), disable. The last org admin cannot be removed.

**System health** [BHD operator] — database, integrations (simulator / Graph reachability), the scheduler (on/off, last tick), and when a runner last claimed work. If *Run assessment* sits in *Queued…*, this is where to look.

**Audit log** [platform admin: platform events; org admin: own organisation] — every decision with actor, time, target.

---

## Things that look like bugs but aren't

- **"Your role cannot do this"** on a page you can see in the sidebar: the sidebar and the API use the same permission table, but a few pages show for a role that the API fences off (System Health for platform admin is the known one — being decided with BHD).
- **Queued… that never finishes** on a Mac/Linux platform: the engine is PowerShell; a Windows runner must be polling.
- **Evidence content missing in lists**: lists never load content, only metadata; open the item.
- **An approve button that then says you can't**: you requested it; the second-person rule holds even if the button showed. Fixed on master (the hint now appears instead of the button).

## Getting help

Help (top right) links to this guide. For anything about your tenant, engines or live access, your BHD operator; for access and roles, your org admin.
