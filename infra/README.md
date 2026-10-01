# Infrastructure for keyless CI

Nothing here contains a secret. Replace `ORG/REPO`, `ACCOUNT`, bucket and
project names, then hand the AWS files to whoever owns your AWS account
(the AWS contractor) and run the Google script once.

| File | What it does | Who applies it |
| --- | --- | --- |
| `github/oidc-sub-customization.json` | Makes the OIDC subject include the workflow file, not just the environment | Repo admin, one API call |
| `aws/staging-role-trust.json` | Only `staging.yml` on main, in the `staging` environment, can assume the staging role | AWS owner |
| `aws/release-role-trust.json` | Only `release.yml` at a `v*` tag, in the `release` environment, can assume the release role | AWS owner |
| `aws/release-role-permissions.json` | Release role can only add objects under its prefix in the Object Lock bucket | AWS owner |
| `gcp/setup-wif.sh` | GitHub OIDC to Google Workload Identity Federation, two service accounts for the Web Store | You or me, once |

Pull-request jobs have no `id-token` permission, so they never get a token
that any of these trust policies could even evaluate.

## Apply the subject claim template (repo admin)

```bash
gh api -X PUT repos/ORG/REPO/actions/oidc/customization/sub --input infra/github/oidc-sub-customization.json
```

After this, the subject for the release job looks like:

```
repo:ORG/REPO:environment:release:job_workflow_ref:ORG/REPO/.github/workflows/release.yml@refs/tags/v1.2.0
```

Why: with environments, GitHub's default subject is `repo:ORG/REPO:environment:release`
and does not include the tag or the workflow. A trust policy written
against tags would never match; a loose one would accept any workflow that
reaches that environment.

## GitHub environments to create

| Environment | Deployment rule | Reviewer | Variables |
| --- | --- | --- | --- |
| `staging` | branch `main` | none | `GCP_WIF_PROVIDER`, `CWS_SERVICE_ACCOUNT`, `CWS_PUBLISHER_ID`, `CWS_ITEM_ID` |
| `release-gate` | tags `v*` | none | `ALLOWED_SIGNERS` |
| `release` | tags `v*` | required (not the signer) | same four as staging, release values; optional `AWS_RELEASE_ROLE_ARN`, `AWS_REGION`, `RELEASE_BUCKET` |

Repository variable for the scheduled check: `CWS_PUBLIC_ITEM_ID`.
