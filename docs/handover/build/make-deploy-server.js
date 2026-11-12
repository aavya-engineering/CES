const path = require('path');
const L = require('./lib');
const { p, runs, h1, h2, h3, bullet, num, nums, muted, note, code, br, img, table, cover, toc, build, write } = L;
const SIZES = require('./sizes.json');

const c = [];
c.push(...cover('CES — Deployment Guide', 'Demo / test server today · production shape · the Windows execution host', 'Aavya Engineering for Blue Heron Defense · platform state: master, 12 November 2026 · supersedes DEPLOYMENT.md (27 Oct) for the server parts'));
c.push(note('Compliance decisions this guide cannot make: where CES is hosted (SYS-NFR-18), who administers it (US persons, SYS-NFR-14), FIPS mode for TLS and disks (SYS-NFR-04), backup RPO/RTO (SYS-NFR-07), and whether evidence content is CUI (OQ-11 — decides ESP vs CSP / FedRAMP Moderate). Until BHD decides, any server holds review and test data only.'));
c.push(br());
c.push(...toc());

c.push(h1('1. What gets deployed, and where'));
c.push(p('Two machines, by design (doc 42, ADR-02): a Linux application server for the platform, and a Windows execution host for the engines. The platform never holds a tenant credential; the Windows host never holds platform state.'));
c.push(img(path.join(__dirname, 'arch-preview.png'), 6.5, SIZES['arch-preview.png']));
c.push(muted('Figure 1 — as built. Editable: docs/architecture/ces-platform.drawio.'));
c.push(table(['Machine', 'Runs', 'Now (demo / test)', 'Production (before the first real customer)'], [
  ['Linux app server', 'nginx (TLS) · ces-web (portal) · muster-api · PostgreSQL 16 · optionally tenant-stacksim for demos', '1 VM, 4 vCPU / 16 GB / 128 GB SSD, Ubuntu 24.04, Docker; inbound 443 (+22 from admin IPs). Today: 136.108.118.191 via sslip.io names', 'Azure Government (or AWS GovCloud): VM without public IP behind App Gateway WAF, Azure Database for PostgreSQL Flexible Server, Key Vault for secrets, Bastion + MFA, Azure Monitor, Azure Backup'],
  ['Windows execution host', 'tenant runner (npm run runner) · BHD engines (Stamper, AdminOps, EvidenceOps, Evidence Collector) · Graph PowerShell · tenant certificate', '1 VM, 4 vCPU / 16 GB / 128 GB, Windows Server 2022 or Win 11, PowerShell 5.1; outbound 443 only; RDP from admin IPs', 'Same, inside the customer boundary (Azure Government VNet), no public IP, certificate in the machine store, administered by verified US persons'],
], [1700, 2600, 2500, 2560]));
c.push(p('Not deployed by the containers: Stamper, AdminOps, EvidenceOps, Evidence Collector, Planner — their code is in the repository and they run on the Windows host from BHD\u2019s kit.'));

c.push(h1('2. Linux application server'));
c.push(h2('2.1 Requirements'));
c.push(table(['Item', 'Minimum'], [
  ['OS', 'Ubuntu 22.04 or 24.04 LTS, x86_64 (any Linux with Docker works)'],
  ['Size', 'Demo: 2 vCPU / 4 GB / 30 GB. Recommended: 4 vCPU / 16 GB / 128 GB SSD'],
  ['Software', 'Docker Engine 24+ with the docker compose plugin; Git'],
  ['Outbound during the build', 'Docker Hub, registry.npmjs.org, binaries.prisma.sh, deb.debian.org'],
  ['Inbound', '443 from users; 22 from admins only. Never expose 8080, 4000 or 5432'],
  ['DNS', 'A name for the portal (today: muster.136.108.118.191.sslip.io; production: ces.<bhd-domain>)'],
], [2400, 6960]));
c.push(h2('2.2 How the containers fit'));
c.push(...code(['Browser ──HTTPS──► nginx on the host (TLS) ──HTTP──► web:8080 (nginx in Docker)', '                                                   ├─ /            → portal files', '                                                   └─ /api /auth   → api:4000 ──► db:5432', 'runner (Windows) ──HTTPS──► /api/engagements/:id/{assessments,remediation}/runner/…']));
c.push(bullet('db (PostgreSQL 16) and api (muster-api :4000) sit on an internal Docker network; only web publishes a port (8080, bound to 127.0.0.1 behind the host TLS proxy).'));
c.push(bullet('On every start the API waits for the database, applies new migrations (001–025 today), refreshes the least-privilege muster_app role, loads the CES-Shared reference content, and creates the first administrator on an empty database.'));
c.push(bullet('The API refuses to start as a superuser or a BYPASSRLS role: tenant isolation is Postgres row-level security, not code discipline.'));
c.push(h2('2.3 Install Docker and Git (once)'));
c.push(...code(['sudo apt-get update && sudo apt-get install -y ca-certificates curl git', 'curl -fsSL https://get.docker.com | sudo sh', 'sudo usermod -aG docker $USER      # then log out and back in', 'docker compose version             # must print v2.x']));
c.push(h2('2.4 Get the code'));
c.push(p('Use a read-only deploy key or token for the private repository; never a personal password.'));
c.push(...code(['sudo mkdir -p /opt/ces && sudo chown $USER /opt/ces', 'git clone https://github.com/aavya-engineering/CES.git /opt/ces/ces-platform', 'cd /opt/ces/ces-platform', 'git checkout <release tag>         # e.g. v2026.11.12; master only for the demo box']));
c.push(h2('2.5 Configure'));
c.push(...code(['cd /opt/ces/ces-platform/deploy', './start.sh                 # first run only: creates .env with random secrets (chmod 600) and stops', 'nano .env                  # set INITIAL_ADMIN_EMAIL, PUBLIC_URL; HTTP_BIND=127.0.0.1 behind a TLS proxy on this host']));
c.push(table(['Setting in deploy/.env', 'Meaning'], [
  ['POSTGRES_PASSWORD', 'Database superuser password; used only for migrations at start-up. Generated.'],
  ['APP_DB_PASSWORD', 'Password of muster_app, the role the API runs as. Generated.'],
  ['JWT_SECRET', 'Signs sign-in tokens. Generated. Changing it signs everyone out.'],
  ['JWT_EXPIRES_IN', 'Token lifetime; 30m on the server (8h is the development default). Active users are refreshed automatically.'],
  ['INITIAL_ADMIN_EMAIL / INITIAL_TENANT_NAME', 'First platform administrator and the organisation it belongs to (default Blue Heron Defense). Created once, on an empty database.'],
  ['HTTP_PORT / HTTP_BIND', 'Where web listens (default 0.0.0.0:8080). Use 127.0.0.1 behind a TLS proxy on the same host.'],
  ['CES_VERSION', 'Image tag, e.g. v2026.11.12.'],
  ['PUBLIC_URL', 'Address users open, e.g. https://muster.136.108.118.191.sslip.io. Used in password-reset e-mails.'],
  ['SMTP_URL / MAIL_FROM', 'Outbound e-mail for Forgot password. Empty = no e-mail; an administrator resets passwords in Users.'],
  ['ANTHROPIC_API_KEY', 'Optional. Without it the adaptive interview and coach answer 503 degraded and the SPA falls back to the static interview. Do not set it until BHD rules on data leaving the boundary (doc 50 §6).'],
  ['MONITOR_SCHEDULER / MONITOR_SCHEDULER_INTERVAL_MS', 'Scheduled monitoring inside the API process (off by default). One API instance only.'],
  ['CES_ENGINE_LOCAL', 'Leave unset on Linux: discovery jobs queue for the Windows runner. (1 forces in-process — only meaningful on Windows; 0 forces the queue.)'],
  ['CES_STRICT_SECRETS', 'Set to 1: forbid inline secrets in tenant JSON (PB-02).'],
], [3400, 5960]));
c.push(note('Keep deploy/.env with the database backups and readable by the deploy user only. Without it the stored data cannot be reached. In production these values move to a vault (Key Vault) and are injected, not stored in a file.'));
c.push(h2('2.6 Start and check'));
c.push(...code(['./start.sh                         # builds the images (10–20 min the first time) and starts', 'docker compose logs -f api         # wait for: "[ces] muster-api starting on port 4000" and "connected as muster_app"', 'docker compose ps                  # db healthy, api and web running', 'curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/api/portfolio   # 401 = API reached, asks for sign-in']));
c.push(h2('2.7 HTTPS'));
c.push(p('web serves plain HTTP; TLS terminates in front of it. Two options are scripted today:'));
c.push(runs([{ text: 'Option 1 — ZeroSSL certificate with host nginx (the demo box today). ', bold: true }, 'deploy/nginx-zerossl.conf already names muster / api / stamper / ao / eo / sim / ec .136.108.118.191.sslip.io. Install the certificate zip BHD issues:']));
c.push(...code(['sudo ./deploy/setup-ssl.sh ~/136.108.118.191.sslip.io.zip   # copies the cert to /etc/ssl/ces, installs the site, reloads nginx']));
c.push(p('As of 12 November 2026 the demo box still serves a self-signed certificate (issuer = subject “Blue Heron Defense CES”): the ZeroSSL step was never run. Browsers show ERR_CERT_AUTHORITY_INVALID until it is.'));
c.push(runs([{ text: 'Option 2 — Caddy with automatic Let\u2019s Encrypt (needs a real DNS name, not sslip.io on a bare IP). ', bold: true }, 'Set HTTP_BIND=127.0.0.1, install Caddy, and:']));
c.push(...code(['ces.example.com {', '    reverse_proxy 127.0.0.1:8080', '    header Strict-Transport-Security "max-age=31536000"', '}']));
c.push(p('Either way: TLS 1.2+, pass X-Forwarded-For and X-Forwarded-Proto (the bundled nginx already sets MUSTER_TRUST_PROXY=1), and restrict 8080 to the proxy. If BHD requires FIPS-validated TLS (SYS-NFR-04), the terminator must run in FIPS mode — TBD.'));
c.push(h2('2.8 First sign-in and users'));
c.push(...nums(['cat /opt/ces/ces-platform/deploy/output/initial-admin.txt — sign in, choose a new password, then rm the file.', 'Platform › Users: create a second platform administrator (one admin cannot publish their own CES-Shared draft) and the BHD operator accounts.', 'Each org admin then creates their organisation\u2019s users in Administration › Access › Users (customer roles only).', 'Optional for a demo tenant: Administration › Settings › Modules hides sections you do not want to show.']));
c.push(note('Never run npm run seed:dev or seed:demo-portfolio on a shared or production server; they are laptop-only demo data.'));

c.push(h1('3. Windows execution host (tenant runner)'));
c.push(p('The engines are Windows PowerShell 5.1 and read the Windows certificate store; BHD\u2019s kit does not support Linux (PL-147). The runner is the only process that talks to a tenant, and it pulls work from the platform over HTTPS — no inbound port on the customer side.'));
c.push(h2('3.1 Prepare the host'));
c.push(...nums(['Windows Server 2022 or Windows 11, PowerShell 5.1, Git for Windows, Node.js 24. Outbound 443 to the platform and to Microsoft .us endpoints; nothing inbound except RDP from admin IPs.', 'BHD\u2019s kit: clone to exactly C:\\ces-nb and run bootstrap.ps1 (and bootstrap.ps1 -Live for the Graph module in the live phase); create the kit secrets from secrets.inventory.yaml; the tenant certificate goes into the machine certificate store. Details: doc 42 Part A / 45 Part B.', 'Our repository: git clone … C:\\ces, then npm ci in C:\\ces\\ces-muster\\muster-api (the runner lives in that package; no database needed on this host).']));
c.push(h2('3.2 Runner account and configuration'));
c.push(p('Today the runner signs in with a BHD-operator account on the customer\u2019s tenant (a dedicated runner role is the next step — doc 48 G1, pending BHD). Create it in Administration › Access › Users as a BHD operator, then on the host:'));
c.push(...code(['$env:CES_API_URL          = \'https://api.136.108.118.191.sslip.io/api\'   # must end in /api', '$env:CES_RUNNER_EMAIL     = \'runner@<customer>.local\'', '$env:CES_RUNNER_PASSWORD  = \'<password>\'            # or CES_RUNNER_TOKEN; never on the command line in a shared session', '$env:CES_RUNNER_NAME      = \'win-runner-01\'', '$env:CES_RUNNER_INTERVAL_MS = \'30000\'', '# remediation lane, once BHD provides the kit CLI entry:', '# $env:CES_RUNNER_REMEDIATION_CMD  = \'powershell.exe\'', '# $env:CES_RUNNER_REMEDIATION_ARGS = \'["-NoProfile","-ExecutionPolicy","Bypass","-File","C:\\\\ces-nb\\\\runner\\\\remediate.ps1"]\'', 'cd C:\\ces\\ces-muster\\muster-api', 'npm run runner -- --once     # one pass to prove the round trip', 'npm run runner               # polls until stopped']));
c.push(p('What it does each pass: lists the engagements its account can see, claims queued discovery jobs, runs the registry walk (201 PowerShell reads) against the simulator or — only for jobs requested through the live gate — the tenant, posts the envelope and captures. Remediation runs are claimed only when the command seam is configured. A claimed job always gets a result; the API refuses a result from any runner other than the one that claimed.'));
c.push(h2('3.3 Run it as a service'));
c.push(p('Use NSSM or a Scheduled Task (At startup, run whether user is logged on or not) with the environment above stored in the service definition — not in a .ps1 that others can read. Log to a file; the runner prints one line per claim/result and warns when it is not on Windows.'));
c.push(h2('3.4 Check'));
c.push(bullet('Administration › System health on the platform shows the runner\u2019s last claim time.'));
c.push(bullet('Assess › Run assessment on a Linux platform goes Queued… → a run with an SPRS score within one poll interval.'));
c.push(bullet('The runner log shows discovery <job> (sim · muster-partial): succeeded.'));

c.push(h1('4. Backup and restore'));
c.push(...code(['cd /opt/ces/ces-platform/deploy', 'docker compose --env-file .env exec -T db pg_dump -U postgres -Fc muster_db > /opt/ces/backup/muster_db-$(date +%F).dump']));
c.push(p('Run daily from cron; keep copies off the server, encrypted, together with deploy/.env. Restore into a stopped API:'));
c.push(...code(['docker compose --env-file .env stop api web', 'docker compose --env-file .env exec -T db pg_restore -U postgres -d muster_db --clean --if-exists < /opt/ces/backup/muster_db-YYYY-MM-DD.dump', './start.sh']));
c.push(p('Test a restore before going live. Evidence content lives in the database today (base64/text with SHA-256); the WORM evidence store and backup encryption/key custody are production items (doc 48 G4, doc 50). RPO/RTO: TBD with BHD.'));

c.push(h1('5. Updating and rolling back'));
c.push(...code(['cd /opt/ces/ces-platform', '# backup first (section 4)', 'git fetch --tags && git checkout v2026.11.12', 'sed -i \'s/^CES_VERSION=.*/CES_VERSION=v2026.11.12/\' deploy/.env', 'cd deploy && ./start.sh            # rebuilds; new migrations are applied automatically']));
c.push(p('Roll back: check out the previous tag, set CES_VERSION back, ./start.sh. Migrations only move forward — if the new version applied one, also restore the backup taken before the update. Write migrations expand-then-contract so the previous image still runs against the new schema.'));

c.push(h1('6. Verification checklist'));
['docker compose ps: db healthy, api and web running', 'The portal opens over HTTPS with a valid certificate (not self-signed)', 'GET /api/portfolio without a token returns 401', 'docker compose logs api shows connected as muster_app and no superuser warning', 'Ports 4000 and 5432 are not reachable from outside (nc -zv <server> 4000 fails)', 'Sign in as the first admin → change password → create the second admin and an operator', 'CES-Shared → 110 Requirements lists 110 rows; Standard Evidence Catalog shows 50', 'Administration › System health (as a BHD operator): DB ok, scheduler state, runner last claim', 'From the Windows host: npm run runner -- --once logs a pass against the server'].forEach((t) => c.push(bullet(t)));

c.push(h1('7. Troubleshooting'));
c.push(table(['Symptom', 'Cause and fix'], [
  ['set POSTGRES_PASSWORD in .env', '.env is missing or empty. Run ./start.sh once to create it.'],
  ['Build fails at npm ci or prisma generate', 'No outbound access to registry.npmjs.org or binaries.prisma.sh during the build.'],
  ['Sign-in page says the API is not reachable', 'docker compose logs api — usually still migrating, or APP_DB_PASSWORD changed after the role existed. Do not change DB passwords in .env on an existing database.'],
  ['ERR_CERT_AUTHORITY_INVALID in the browser', 'Self-signed certificate still installed. Run deploy/setup-ssl.sh with the ZeroSSL zip, or switch to Caddy/Let\u2019s Encrypt with a real DNS name.'],
  ['PLATFORM_ADMIN_FENCED for an administrator', 'Expected: platform administrators have no access to customer data (PB-01).'],
  ['Every user gets “too many attempts”', 'The proxy is not passing X-Forwarded-For.'],
  ['Run assessment stays Queued…', 'No runner is polling, or its account is not a BHD operator in that tenant. Check System health → runner last claim and the runner log.'],
  ['Runner: 409 RUNNER_MISMATCH', 'Two runners share a name or a result was posted by a different runner than the one that claimed. Give each host its own CES_RUNNER_NAME.'],
  ['Runner: login failed / 403 ROLE_MATRIX', 'Account is not bhd_operator, or must change its password (sign in once in the portal).'],
  ['No initial-admin.txt', 'Users already exist, or INITIAL_ADMIN_EMAIL was empty on the first start.'],
], [3600, 5760]));

c.push(h1('8. Production: what changes, and what BHD must decide'));
c.push(table(['Area', 'Demo / test today', 'Production'], [
  ['Hosting', 'One Linux VM with a public IP; sslip.io names', 'Azure Government (or AWS GovCloud) per SYS-NFR-18; private VNet; App Gateway WAF; real DNS'],
  ['Database', 'Postgres in a container, local volume', 'Managed PostgreSQL Flexible Server, encrypted at rest, automated backups, restore drill recorded'],
  ['Secrets', 'deploy/.env (chmod 600)', 'Key Vault; injected at start; rotated; no secrets in files'],
  ['Identity', 'E-mail + password, throttle', 'MFA/SSO (TOTP or Entra ID — BHD decision, doc 48 G2); token revocation on disable (doc 49 A4)'],
  ['Runner', 'BHD-operator account, claim-bound results', 'Dedicated runner role + registration, signed results (G1/G3); one Windows host per customer boundary'],
  ['Evidence', 'In Postgres with SHA-256', 'WORM blob store inside the customer boundary if OQ-11 says evidence is CUI; otherwise Postgres + encrypted backups'],
  ['Audit / logs', 'Postgres audit_events; container logs', 'Audit forwarded to a SIEM; structured JSON logs with request ids; alerts (runner silent, failed jobs, 5xx)'],
  ['Scale', 'Single API process (in-memory throttle, in-process scheduler)', 'Postgres-backed throttle + advisory-lock scheduler before a second instance'],
  ['Compliance posture', 'Review and test data only', 'ESP (SPD only) or CSP (CUI → FedRAMP Moderate); US-person administrators; pen-test before V1 (SYS-NFR-12)'],
], [1700, 3300, 4360]));
c.push(p('Open with BHD (doc 47 §3, 49 §1, 50): hosting subscription and administrators, OQ-11, MFA/SSO choice, runner identity, the kit CLI entry for live Stamper/AdminOps, ZeroSSL certificate, pen-test provider.'));

write(build(c, { title: 'CES — Deployment Guide (server)', description: 'Linux application server, Windows execution host, HTTPS, backup, update, production shape', headerText: 'CES — Deployment Guide · demo / test server and production shape · Aavya for Blue Heron Defense' }), path.join(__dirname, 'CES-Deployment-Guide-Server.docx'));
