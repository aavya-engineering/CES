# docs/handover

Hand-over pack for new users and new engineers, generated from the running demo stack.

- `CES-User-Guide-and-Training.docx` — user guide screen by screen (30 screenshots), architecture, roles, run-it-yourself, five-day training, troubleshooting.
- `CES-Platform-Walkthrough.pptx` — the same as a 50-slide walkthrough deck.
- `build/` — how they are made: `screens.json` (one entry per screen: title, role, route, text), `make-docx.js`, `make-pptx.js` (docx / pptxgenjs; run with Node from a folder that has `docx`, `pptxgenjs` and the cropped screenshots).

Regenerate after a UI change:
1. `cd ces-muster && CES_E2E_LIVE=1 npx playwright test --project=live e2e/screenshots.spec.ts` → `docs/screenshots/*.png`
2. crop each PNG to 1440×≤1150 (JPEG), update `sizes.json`, run `node make-docx.js` and `node make-pptx.js`.
The diagram is `docs/architecture/ces-platform.drawio` (editable) rendered to `ces-platform.png` via `ces-platform.html`.
