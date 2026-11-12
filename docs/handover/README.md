# docs/handover

Hand-over pack for new users and new engineers, generated from the running demo stack.

- `CES-User-Guide-and-Training.docx` — user guide screen by screen (30 screenshots), architecture, roles, run-it-yourself, five-day training, troubleshooting.
- `CES-Platform-Walkthrough.pptx` — the same as a 50-slide walkthrough deck.
- `CES-Evidence-Traceability.pptx` — 8 slides for the customer/assessor question: how evidence is generated and checked, how the 110 requirements reach "met", where the reports are, what the assessor sees.
- `CES-Installation-Guide-Windows.docx` — developer laptop setup (Windows 11), same content as `docs/DEV-SETUP-WINDOWS.md`.
- `CES-Deployment-Guide-Server.docx` — Windows Server 2022 deployment, same content as project doc 29/42.
- `build/` — how they are made: `screens.json` (one entry per screen: title, role, route, text), `make-docx.js`, `make-pptx.js`, `make-trace.js`, `make-install-windows.js`, `make-deploy-server.js` (docx / pptxgenjs; run with Node from a folder that has `docx`, `pptxgenjs` and the cropped screenshots).

Regenerate after a UI change:
1. `cd ces-muster && CES_E2E_LIVE=1 npx playwright test --project=live e2e/screenshots.spec.ts` → `docs/screenshots/*.png`
2. crop each PNG to 1440×≤1150 (JPEG), update `sizes.json`, run `node make-docx.js` and `node make-pptx.js`.
The diagram is `docs/architecture/ces-platform.drawio` (editable) rendered to `ces-platform.png` via `ces-platform.html`.
