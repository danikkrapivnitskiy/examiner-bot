#!/bin/bash

# Script to set Telegram webhook (works in Docker production environment)
# Usage: ./scripts/set-webhook.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    exit 1
fi

# Get BOT_TOKEN from .env
BOT_TOKEN=$(grep "^TELEGRAM_BOT_TOKEN=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'" | xargs)

if [ -z "$BOT_TOKEN" ]; then
    echo -e "${RED}❌ Error: TELEGRAM_BOT_TOKEN not found in .env${NC}"
    exit 1
fi

# Get WEBHOOK_URL from .env
WEBHOOK_URL=$(grep "^WEBHOOK_URL=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'" | xargs)

if [ -z "$WEBHOOK_URL" ]; then
    echo -e "${RED}❌ Error: WEBHOOK_URL not found in .env${NC}"
    exit 1
fi

echo -e "${GREEN}Setting webhook...${NC}"
echo "URL: $WEBHOOK_URL"
echo ""

# Check DNS resolution first
echo "Checking DNS resolution..."
# Derive webhook hostname from WEBHOOK_URL for DNS check
WEBHOOK_HOST=$(echo "$WEBHOOK_URL" | sed -E 's|^https?://([^/]+).*|\1|')
DNS_RESULT=$(nslookup "$WEBHOOK_HOST" 2>/dev/null | grep -A 1 "Name:" | tail -1 | awk '{print $2}')
if [ -n "$DNS_RESULT" ]; then
    echo -e "${GREEN}✅ DNS resolves to: $DNS_RESULT${NC}"
else
    echo -e "${YELLOW}⚠️  DNS resolution unclear, but continuing...${NC}"
fi
echo ""

# Try setting webhook with retries
MAX_RETRIES=3
RETRY_COUNT=0
SUCCESS=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if [ $RETRY_COUNT -gt 0 ]; then
        echo -e "${YELLOW}Retry attempt $RETRY_COUNT/$MAX_RETRIES...${NC}"
        echo "Waiting 10 seconds for DNS propagation..."
        sleep 10
    fi

    # Get secret token from .env
    SECRET_TOKEN=$(grep "^TELEGRAM_WEBHOOK_SECRET=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'" | xargs)

    # Set webhook with drop_pending_updates, secret_token and allowed_updates
    RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
        -F "url=${WEBHOOK_URL}" \
        -F "drop_pending_updates=true" \
        -F "secret_token=${SECRET_TOKEN}" \
        -F 'allowed_updates=["message","edited_message","callback_query","pre_checkout_query","channel_post","edited_channel_post"]')

    # Check if successful
    if echo "$RESPONSE" | grep -q '"ok":true'; then
        echo -e "${GREEN}✅ Webhook set successfully!${NC}"
        echo ""
        echo "Response:"
        echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
        SUCCESS=true
        break
    else
        ERROR_DESC=$(echo "$RESPONSE" | jq -r '.description // "Unknown error"' 2>/dev/null || echo "Unknown error")
        if echo "$ERROR_DESC" | grep -q "Failed to resolve host"; then
            echo -e "${YELLOW}⚠️  DNS not resolved yet by Telegram servers${NC}"
            echo "Error: $ERROR_DESC"
        else
            echo -e "${RED}❌ Failed to set webhook${NC}"
            echo "Error: $ERROR_DESC"
            echo ""
            echo "Full response:"
            echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
            exit 1
        fi
    fi

    RETRY_COUNT=$((RETRY_COUNT + 1))
done

if [ "$SUCCESS" = false ]; then
    echo ""
    echo -e "${RED}❌ Failed to set webhook after $MAX_RETRIES attempts${NC}"
    echo ""
    echo "Possible solutions:"
    echo "1. Wait 10-30 minutes for DNS propagation"
    echo "2. Check DuckDNS IP is correct: https://www.duckdns.org/"
    echo "3. Try again later: ./scripts/set-webhook.sh"
    echo ""
    echo "Last response:"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    exit 1
fi

echo ""
echo -e "${GREEN}Checking webhook status...${NC}"

# Get webhook info
INFO_RESPONSE=$(curl -s "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo")

if echo "$INFO_RESPONSE" | grep -q '"ok":true'; then
    echo -e "${GREEN}✅ Webhook info:${NC}"
    echo "$INFO_RESPONSE" | jq '.' 2>/dev/null || echo "$INFO_RESPONSE"
else
    echo -e "${YELLOW}⚠️  Could not get webhook info${NC}"
    echo "$INFO_RESPONSE"
fi

