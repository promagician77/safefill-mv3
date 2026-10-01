# SafeFill: MV3 form-fill extension spike

A working spike for a Chrome extension that fills third-party web forms from
your own backend, for a licensed professional to review and submit.

- **Exactly one match, or skip.** A value is written only when exactly one
  visible, editable field could take it, and that field could take no other value.
- **Stores nothing, logs nothing.** No `storage` permission, so the API does
  not exist at runtime. Network locked to your backend by CSP. Reports carry
  statuses and reasons, never values.
- **Never submits.** No form submission, no synthetic clicks or key presses.
- **Reproducible, signed releases.** Zero-dependency deterministic build, a
  signed tag that carries every file's hash, CI that must reproduce them file
  for file, and a check of the package the Chrome Web Store actually serves.

## Run it

Requires Node 22 (see `.nvmrc`). The build and the extension have no dependencies.

```bash
npm run build          # dist/ (unpacked extension), release/SHA256SUMS, release/safefill-0.1.0.zip
npm run check          # policy gate on dist/
npm test               # 49 unit tests, including real SSH-signed tags (needs ssh-keygen)
npm start              # technical document, demo portals and demo API on http://localhost:3000

npm ci --ignore-scripts && npx playwright install chromium
npm run e2e            # 11 browser tests in real Chromium against the exact build
```

## Layout

| Path | What it is |
| --- | --- |
| `extension/` | The extension: manifest, worker, popup, matching rules, fill engine |
| `scripts/` | Build, policy gate, release gate, Web Store client and verifier |
| `test/`, `e2e/` | Unit tests (node:test) and browser tests (Playwright) |
| `fixtures/` | Demo record and three sample portals |
| `site/`, `api/` | Technical document site and the demo backend (Vercel) |
| `.github/` | CI: pr, staging, release, published-check, CODEOWNERS |
| `infra/` | GitHub OIDC claim template, AWS trust policies, Google WIF setup |
| `docs/` | Technical design, install procedure, release runbook, timeline |

## Deploy the document site (Vercel)

Import the repo in Vercel and name the project `safefill-spike`. `vercel.json`
skips `npm install` (nothing to install) and builds `public/`.

The extension only talks to `https://safefill-spike.vercel.app`. If you deploy
under another name, change it in the committed source and rebuild:

```bash
node scripts/set-origin.mjs https://your-project.vercel.app
```

## What is real and what is written but not yet run

Real and tested: the extension, fill engine, policy gate, deterministic build,
signed-tag release gate, published-package verifier (on store-shaped
packages), demo backend, and the full ticket-to-fill chain in Chromium.

Written, not yet run: the GitHub workflows (need the repo and environments)
and the Web Store upload (needs a publisher account and Google Cloud project).
All workflows pass `actionlint`.
