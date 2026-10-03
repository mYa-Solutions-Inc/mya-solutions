#!/usr/bin/env bash
# FILE / ROOT: services/jean-site/deploy.sh
# DESCRIPTION: Deploys jean-site to Google Cloud Run. First copies the site's
#   assets/jean/site-index.json into this folder (the Dockerfile bundles it as the
#   first-boot fallback), then runs `gcloud run deploy --source .`. The Anthropic key
#   comes from Secret Manager; see README.md for the one-time setup.
set -euo pipefail

# ---- Edit these -------------------------------------------------------------
PROJECT="${PROJECT:-REPLACE_WITH_GCP_PROJECT_ID}"
REGION="${REGION:-us-west1}"
SERVICE="jean-site"
SECRET_NAME="jean-site-anthropic-key"
MODEL="claude-haiku-4-5-20251001"
ALLOWED_ORIGINS="https://myasolutions.org,https://www.myasolutions.org"
DAILY_LIMIT="2000"     # per instance; --max-instances 2 below => at most 2x this per day
RATE_PER_MIN="10"
# -----------------------------------------------------------------------------

if [[ "$PROJECT" == REPLACE_WITH_* ]]; then
  echo "Set PROJECT (edit deploy.sh or run: PROJECT=my-project ./deploy.sh)" >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

SRC_INDEX="$HERE/../../assets/jean/site-index.json"
if [[ ! -f "$SRC_INDEX" ]]; then
  echo "Missing $SRC_INDEX — generate the site index before deploying." >&2
  exit 1
fi
cp "$SRC_INDEX" "$HERE/site-index.json"
if command -v node >/dev/null 2>&1; then
  node -e 'const j=JSON.parse(require("fs").readFileSync("site-index.json","utf8")); if(j.version!==1||!Array.isArray(j.sections)||!j.sections.length){console.error("site-index.json is not a valid v1 index");process.exit(1)} console.log("Bundling site index: "+j.sections.length+" sections, generated "+j.generated)'
fi

# gcloud's "^@^" prefix switches the env-var delimiter to "@" so the comma-separated
# origin list survives intact (see: gcloud topic escaping).
gcloud run deploy "$SERVICE" \
  --project "$PROJECT" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --max-instances 2 \
  --memory 256Mi \
  --cpu 1 \
  --timeout 60 \
  --set-env-vars "^@^JEAN_PROVIDER=anthropic@JEAN_MODEL=${MODEL}@JEAN_ALLOWED_ORIGINS=${ALLOWED_ORIGINS}@JEAN_DAILY_LIMIT=${DAILY_LIMIT}@JEAN_RATE_PER_MIN=${RATE_PER_MIN}@JEAN_INDEX_URL=https://myasolutions.org/assets/jean/site-index.json@JEAN_INDEX_REFRESH_S=600" \
  --set-secrets "ANTHROPIC_API_KEY=${SECRET_NAME}:latest"

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)')"
echo
echo "Deployed: $URL"
echo "Health:   curl -s $URL/health"
echo "Point the site at it in assets/js/jean-config.js:  window.JEAN_ENDPOINT = \"$URL\";"
