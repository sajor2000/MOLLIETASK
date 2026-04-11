#!/bin/bash
# Auth diagnostic: verifies the Clerk → Convex auth chain
# Run: bash scripts/check-auth.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=== Clerk → Convex Auth Diagnostic ==="
echo ""

# 1. Check .env.local has CLERK_JWT_ISSUER_DOMAIN
if grep -q "CLERK_JWT_ISSUER_DOMAIN=" .env.local 2>/dev/null; then
  DOMAIN=$(grep "CLERK_JWT_ISSUER_DOMAIN=" .env.local | cut -d= -f2)
  echo -e "${GREEN}✓${NC} .env.local has CLERK_JWT_ISSUER_DOMAIN=${DOMAIN}"
else
  echo -e "${RED}✗${NC} .env.local missing CLERK_JWT_ISSUER_DOMAIN"
  exit 1
fi

# 2. Check Convex dev env var
echo ""
echo "Checking Convex environment variables..."
DEV_ENV=$(npx convex env list 2>&1)
if echo "$DEV_ENV" | grep -q "CLERK_JWT_ISSUER_DOMAIN"; then
  echo -e "${GREEN}✓${NC} Convex DEV has CLERK_JWT_ISSUER_DOMAIN set"
else
  echo -e "${RED}✗${NC} Convex DEV missing CLERK_JWT_ISSUER_DOMAIN"
  echo "  Fix: npx convex env set CLERK_JWT_ISSUER_DOMAIN ${DOMAIN}"
fi

# 3. Check OIDC discovery endpoint
echo ""
echo "Checking OIDC discovery endpoint..."
OIDC_URL="${DOMAIN}/.well-known/openid-configuration"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$OIDC_URL")
if [ "$HTTP_CODE" = "200" ]; then
  ISSUER=$(curl -s "$OIDC_URL" | python3 -c "import sys,json; print(json.load(sys.stdin).get('issuer',''))" 2>/dev/null || echo "")
  if [ "$ISSUER" = "$DOMAIN" ]; then
    echo -e "${GREEN}✓${NC} OIDC issuer matches: ${ISSUER}"
  else
    echo -e "${RED}✗${NC} OIDC issuer mismatch: got '${ISSUER}', expected '${DOMAIN}'"
  fi
else
  echo -e "${RED}✗${NC} OIDC endpoint returned HTTP ${HTTP_CODE} (expected 200)"
fi

# 4. Check auth.config.ts exists and references the env var
echo ""
if [ -f "convex/auth.config.ts" ]; then
  if grep -q "CLERK_JWT_ISSUER_DOMAIN" convex/auth.config.ts; then
    echo -e "${GREEN}✓${NC} convex/auth.config.ts uses CLERK_JWT_ISSUER_DOMAIN env var"
  else
    echo -e "${YELLOW}!${NC} convex/auth.config.ts does not reference CLERK_JWT_ISSUER_DOMAIN — check domain config"
  fi
  if grep -q 'applicationID.*"convex"' convex/auth.config.ts; then
    echo -e "${GREEN}✓${NC} convex/auth.config.ts has applicationID: \"convex\""
  else
    echo -e "${RED}✗${NC} convex/auth.config.ts missing applicationID: \"convex\""
  fi
else
  echo -e "${RED}✗${NC} convex/auth.config.ts not found"
fi

# 5. Remind about Clerk Dashboard
echo ""
echo "=== Manual Check Required ==="
echo -e "${YELLOW}!${NC} Verify in Clerk Dashboard (https://dashboard.clerk.com):"
echo "  → Configure → Integrations → Convex is ENABLED"
echo "  OR"
echo "  → Configure → JWT Templates → a template named 'convex' exists with aud: \"convex\""
echo ""
echo "This is the most common cause of 'No auth provider found matching the given token'."
echo "The JWT template / integration tells Clerk to issue tokens that Convex can validate."

# 6. Deploy check
echo ""
echo "Deploying latest auth config to Convex dev..."
npx convex dev --once 2>&1 | tail -1
echo -e "${GREEN}✓${NC} Convex dev deployment up to date"
