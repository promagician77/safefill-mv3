# Release runbook

Anyone with a signing key in the allowed list can follow this. Nothing here
needs a password, token or stored secret.

## One-time setup for a release signer

```bash
ssh-keygen -t ed25519 -C "you@company.com" -f ~/.ssh/safefill_release
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/safefill_release.pub
```

Send the **public** key (`~/.ssh/safefill_release.pub`) to the repo admin, who
adds a line `you@company.com ssh-ed25519 AAAA...` to the `ALLOWED_SIGNERS`
variable of the `release-gate` environment.

## Cutting a release

1. Bump `version` in `extension/manifest.json` in a pull request. Merge it.
2. Locally, on an up-to-date `main`:
   ```bash
   git pull
   npm run build
   node scripts/tag-message.mjs > /tmp/safefill-tag.txt
   git tag -s v0.2.0 -F /tmp/safefill-tag.txt
   ```
3. Optional check before pushing:
   ```bash
   ALLOWED_SIGNERS_FILE=./my_allowed_signers node scripts/verify-tag.mjs v0.2.0
   ```
4. `git push origin v0.2.0`
5. In GitHub, Actions > release: the **gate** job runs on its own. When it
   passes, approve the **publish** job (release environment). It uploads the
   verified zip and submits it for Web Store review.
6. After the store publishes (hours to days), the **published-check**
   workflow compares the store's package with the signed tag automatically.

## If the gate stops the release

The log names the file and both hashes. Common causes:

- **"not signed by an allowed release key"**: wrong key, or the tag was made
  without `-s`. Delete the tag (`git push --delete origin v0.2.0`), fix, re-tag.
- **"does not match manifest version"**: the tag name and manifest disagree.
- **"rebuild does not match the signed hash list"**: the tag message was made
  from a different build than the tagged commit. Never edit hashes by hand:
  rebuild from the tagged commit and make the message again.

## If published-check fails

Treat it as an incident: the store is serving something that is not exactly
what you signed. Do not publish further. Download the package and run
`node scripts/verify-webstore.mjs --crx <file> --expected <tag message>` to see
which files differ. If it is a new kind of store-added file, it must be added
to the explicit list in `scripts/verify-webstore.mjs` through a reviewed PR.
