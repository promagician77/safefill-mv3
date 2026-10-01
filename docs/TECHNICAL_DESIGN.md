# Technical design

The document site (`site/`, deployed to Vercel) is the readable version of
this file, with diagrams and live demos. This file is the reference.

## 1. Fill flow

1. In the web app, the professional chooses **Fill on portal** for a record.
2. The web app asks the backend for a **ticket** bound to tenant, record and
   portal origin. It expires in 2 minutes and is single use.
3. The web app sends `{type: 'safefill/ticket', ticket, portalUrl, recordLabel}`
   to the extension with `chrome.runtime.sendMessage(EXTENSION_ID, ...)`.
   Only origins in `externally_connectable` can do this; the worker checks
   `sender.origin` again.
4. The worker keeps the ticket in memory (never values) and shows a badge.
5. On the portal tab, the professional opens the popup and presses **Fill this page**.
6. The worker checks the active tab's origin equals the ticket's portal
   origin, then POSTs the ticket to `/api/fill-values` with `cache: no-store`,
   `credentials: omit`, `redirect: error`, and validates the response shape.
7. The worker injects `field-rules.js` and `fill-engine.js` into the tab and
   calls `SafeFill.run(values)` once. Values exist only inside that call.
8. The report (statuses, reasons, candidate labels) goes back to the popup,
   rebuilt from an allowlist of fields.

If Chrome stops the idle worker before step 5, the ticket is gone and the
professional starts again from the app. `chrome.storage.session` would avoid
that but is a storage API, so it is not used without sign-off.

## 2. Matching

For each value from the backend there must be a rule in `field-rules.js`
(signed with the extension). Unknown keys are skipped.

**Candidate:** a visible field of a fillable kind (text-like input, textarea,
single select, date) whose signals contain all words of one of the rule's
phrases, or whose `autocomplete` token matches. Signals: labels (`for` and
wrapping), `aria-labelledby`, `aria-label`, placeholder, title, name, id.
Open shadow roots are searched. Passwords, checkboxes, radios, files and
hidden fields are never candidates.

**Decision**, in order, first match wins:

| Check | Result |
| --- | --- |
| No rule for key / empty / malformed value / duplicate key | skip |
| 0 candidates | skip: no-match |
| 2+ candidates | skip: ambiguous (candidates outlined) |
| The one candidate is also a candidate for another value | skip: shared-field |
| Disabled / read-only | skip |
| Select: not exactly one option equals the value or its text | skip |
| Date: field not `type=date` and no stated format (MM/DD/YYYY etc.) | skip |
| Type, `maxlength`, `pattern` would reject or cut the value | skip |
| Field already has a different value | skip: already-filled |
| Field already has this value | unchanged |
| Otherwise | fill |

**Write:** native prototype `value` setter, then `input` (bubbling, composed)
and `change` events, so React and Angular forms keep the value. The value is
read back; if the page cleared it, the result is reported as a skip.

## 3. Enforcement layers

| Layer | Stops | Proof |
| --- | --- | --- |
| Manifest | storage, broad access | `chrome.storage` undefined at runtime (browser test) |
| CSP `connect-src` | data leaving to any other origin | blocked fetch, no request received (browser test) |
| Policy gate (`scripts/check-policy.mjs`) | storage, logging, beacons, sockets, submission, synthetic input, dynamic code, extra fetches, extra permissions | 10 unit tests inject each violation |
| Report shape | values in diagnostics | tests check no record value appears in any report or the popup |

## 4. Release

- `scripts/build.mjs`: files from `extension/` only (type allowlist), LF and no
  BOM for text, sorted, stored zip with fixed timestamps. Output is byte-identical
  across machines.
- `release/SHA256SUMS`: `sha256sum` format, sorted.
- Tag: `git tag -s vX.Y.Z -F <(node scripts/tag-message.mjs)`, SSH-signed.
- `scripts/verify-tag.mjs`: annotated tag, signature by a key in the allowed
  signers list from the protected `release-gate` environment, tag equals the
  manifest version, clean rebuild equals every hash. Any difference stops the release.
- `publish` job: verifies the artifact zip strictly against the tag message,
  uploads with the Chrome Web Store API v2, submits for review.
- `published-check`: downloads the CRX the store serves, finds the signed tag
  for that version, compares every file. Store additions are an explicit list
  (`_metadata/`, store-managed manifest keys), printed when applied.

## 5. CI trust

| Lane | Trigger | Token |
| --- | --- | --- |
| PR | `pull_request` | none (`id-token` not granted) |
| Staging | push to main (verify), manual run (upload) | OIDC, `staging` environment |
| Release | `v*` tag | OIDC, `release` environment, required reviewer |

OIDC subject customized to `repo`, `environment`, `job_workflow_ref` (see
`infra/`). Actions pinned to commit SHAs; `persist-credentials: false`;
`npm ci --ignore-scripts`; no `pull_request_target`.

## 6. Open decisions

1. Matching rules in the extension (default) or from the backend per portal.
2. Whether the in-memory ticket is acceptable under "stores nothing".
3. A separate Web Store publisher for staging (service accounts are publisher-wide).
4. Who signs release tags, and who approves the release environment.
5. Whether any portal puts its form inside a cross-origin frame.
