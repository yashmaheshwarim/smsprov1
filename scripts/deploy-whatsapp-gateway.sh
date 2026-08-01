#!/usr/bin/env bash
# ─── Deploy the WhatsApp serverless control plane (Supabase Edge Function) ───
# 1. Deploys `supabase/functions/whatsapp-gateway` WITHOUT JWT verification
#    (the app uses its own auth, not Supabase Auth JWT).
# 2. Applies pending DB migrations (creates the whatsapp_gateway_config table
#    + everything else in supabase/migrations/). Non-fatal: a migration failure
#    is reported as a warning so the function fix is never blocked.
#
# Usage (from the repo root):
#   npm run deploy:whatsapp
#   # or: bash scripts/deploy-whatsapp-gateway.sh
#
# After deploying, open the WhatsApp page → Server Settings → Serverless and
# save your gateway URL + API key (stored per-institute in the DB), OR set the
# global env-var fallback with:
#   npx supabase secrets set WHATSAPP_GATEWAY_URL=https://<your-openwa>.up.railway.app \
#       WHATSAPP_GATEWAY_TYPE=openwa WHATSAPP_GATEWAY_API_KEY=owa_k1_...
#
# NOTE: `set -euo pipefail` keeps deploy failures fatal while still allowing
# the `if ! npx supabase db push` below to run non-fatally (commands inside an
# `if` condition are exempt from `-e`).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▸ Deploying whatsapp-gateway Edge Function (--no-verify-jwt) ..."
npx supabase functions deploy whatsapp-gateway --no-verify-jwt

echo ""
echo "▸ Applying pending database migrations (creates whatsapp_gateway_config table) ..."
if ! npx supabase db push; then
  echo ""
  echo "⚠  supabase db push failed — the whatsapp_gateway_config table may not exist."
  echo "   The WhatsApp page will show a clear 'table is missing' message until you"
  echo "   run it manually:  npx supabase db push"
fi

echo ""
echo "▸ Done. Next steps:"
echo "  1) Open the WhatsApp page → Server Settings → Serverless."
echo "  2) Enter your OpenWA gateway URL, pick 'openwa', paste an Admin/Operator API key, Save."
echo "  3) Or use the global fallback instead:"
echo "     npx supabase secrets set WHATSAPP_GATEWAY_URL=https://<your-openwa>.up.railway.app WHATSAPP_GATEWAY_TYPE=openwa WHATSAPP_GATEWAY_API_KEY=<key>"
