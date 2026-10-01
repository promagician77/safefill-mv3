#!/usr/bin/env bash
# Keyless Chrome Web Store publishing:
#   GitHub OIDC -> Google Workload Identity Federation -> service account
#   -> short-lived token with scope https://www.googleapis.com/auth/chromewebstore
# Run once. Needs gcloud and a project where you are an owner.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
REPO="${REPO:?set REPO, e.g. your-org/safefill}"
POOL="github"
PROVIDER="safefill"

gcloud services enable iamcredentials.googleapis.com sts.googleapis.com chromewebstore.googleapis.com --project "$PROJECT_ID"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

gcloud iam workload-identity-pools create "$POOL" \
  --project "$PROJECT_ID" --location global --display-name "GitHub Actions"

# Only this repo, and only the two workflow files in their own environments,
# can exchange a GitHub token here. Pull requests never reach this point:
# they have no id-token permission.
CONDITION="assertion.repository == '${REPO}' && (
  (assertion.environment == 'staging' && assertion.job_workflow_ref == '${REPO}/.github/workflows/staging.yml@refs/heads/main') ||
  (assertion.environment == 'release' && assertion.job_workflow_ref.startsWith('${REPO}/.github/workflows/release.yml@refs/tags/v')))"

gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
  --project "$PROJECT_ID" --location global --workload-identity-pool "$POOL" \
  --issuer-uri "https://token.actions.githubusercontent.com" \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.environment=assertion.environment,attribute.job_workflow_ref=assertion.job_workflow_ref" \
  --attribute-condition "$CONDITION"

for ENV in staging release; do
  SA="cws-${ENV}"
  gcloud iam service-accounts create "$SA" --project "$PROJECT_ID" --display-name "Chrome Web Store ${ENV}"
  gcloud iam service-accounts add-iam-policy-binding "${SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --project "$PROJECT_ID" --role roles/iam.workloadIdentityUser \
    --member "principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.environment/${ENV}"
done

cat <<NEXT

Done. Next steps:
1. Chrome Web Store Developer Dashboard > Account: add
     cws-release@${PROJECT_ID}.iam.gserviceaccount.com   to the production publisher
     cws-staging@${PROJECT_ID}.iam.gserviceaccount.com   to the separate staging publisher
   (A service account can manage every item under a publisher, so keep them apart.)
2. In GitHub, set GCP_WIF_PROVIDER in the staging and release environments to:
     projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}
   and CWS_SERVICE_ACCOUNT to the matching service account email.
NEXT
