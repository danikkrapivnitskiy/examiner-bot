#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=========================================="
echo "  Telegram AI Bot - Status Check"
echo "=========================================="
echo ""

# Detect environment (Docker or local)
DOCKER_MODE=false
if command -v docker compose > /dev/null 2>&1; then
    if [ -f "docker-compose.production.yml" ]; then
        if docker compose -f docker-compose.production.yml ps 2>/dev/null | grep -q "Up"; then
            DOCKER_MODE=true
        fi
    fi
fi

if [ "$DOCKER_MODE" = true ]; then
    echo -e "${BLUE}🐳 Docker Production Mode Detected${NC}"
    echo ""

    # 1. Check Docker containers
    echo "1️⃣  Checking Docker containers:"
    # Try JSON format first (if jq available)
    CONTAINERS_JSON=$(docker compose -f docker-compose.production.yml ps --format json 2>/dev/null)

    if [ -n "$CONTAINERS_JSON" ] && command -v jq > /dev/null 2>&1; then
        # Use jq to parse JSON format
        echo "$CONTAINERS_JSON" | jq -r '.[] | "\(.Name)|\(.State)|\(.Health)"' 2>/dev/null | while IFS='|' read -r name state health; do
            if [ -z "$name" ]; then continue; fi
            if echo "$state" | grep -q "Up"; then
                if [ -n "$health" ] && echo "$health" | grep -q "healthy"; then
                    echo -e "   ${GREEN}✅ $name: $state ($health)${NC}"
                elif echo "$state" | grep -q "Up"; then
                    echo -e "   ${YELLOW}⚠️  $name: $state${NC}"
                else
                    echo -e "   ${RED}❌ $name: $state${NC}"
                fi
            else
                echo -e "   ${RED}❌ $name: $state${NC}"
            fi
        done
    else
        # Fallback: parse standard docker compose ps output (skip header line)
        docker compose -f docker-compose.production.yml ps 2>/dev/null | tail -n +2 | while read -r line; do
            # Skip empty lines and header lines
            if [ -z "$line" ] || echo "$line" | grep -qE "^NAME|^---"; then
                continue
            fi
            # Extract container name (first column)
            CONTAINER_NAME=$(echo "$line" | awk '{print $1}')
            if [ -z "$CONTAINER_NAME" ]; then continue; fi

            if echo "$line" | grep -q "Up.*healthy"; then
                echo -e "   ${GREEN}✅ $CONTAINER_NAME: Up (healthy)${NC}"
            elif echo "$line" | grep -q "Up"; then
                echo -e "   ${YELLOW}⚠️  $CONTAINER_NAME: Up${NC}"
            else
                echo -e "   ${RED}❌ $CONTAINER_NAME: Not running${NC}"
            fi
        done
    fi
    echo ""

    # 2. Check Nginx port
    echo "2️⃣  Checking Nginx (port 80/443):"
    if lsof -Pi :80 -sTCP:LISTEN -t >/dev/null 2>&1 || lsof -Pi :443 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "   ${GREEN}✅ Nginx ports are open${NC}"
    else
        echo -e "   ${RED}❌ Nginx ports are NOT open${NC}"
    fi
    echo ""

    # 3. Health check API
    echo "3️⃣  Health check API:"
    # Try direct Docker network access first (bypasses Nginx redirect)
    HEALTH_CHECK=$(docker exec examiner-bot-api curl -s http://localhost:3000/health 2>/dev/null || curl -s -L -w "\n%{http_code}" http://localhost:3000/health 2>/dev/null)

    # Check if response contains HTTP code (from curl -w)
    if echo "$HEALTH_CHECK" | grep -q "^[0-9]\{3\}$"; then
        # Response has HTTP code format
        HTTP_CODE=$(echo "$HEALTH_CHECK" | tail -1)
        HEALTH_BODY=$(echo "$HEALTH_CHECK" | head -n -1)
    else
        # Direct response from Docker exec (no HTTP code)
        HTTP_CODE="200"
        HEALTH_BODY="$HEALTH_CHECK"
    fi

    if [ "$HTTP_CODE" = "200" ] && echo "$HEALTH_BODY" | grep -q "healthy\|ok"; then
        echo -e "   ${GREEN}✅ Server is responding${NC}"
        if command -v jq > /dev/null 2>&1 && [ -n "$HEALTH_BODY" ]; then
            STATUS=$(echo "$HEALTH_BODY" | jq -r '.status // "N/A"' 2>/dev/null)
            REDIS=$(echo "$HEALTH_BODY" | jq -r '.redis // "N/A"' 2>/dev/null)
            QUEUE=$(echo "$HEALTH_BODY" | jq -r '.queue // "N/A"' 2>/dev/null)
            echo "   Status: $STATUS | Redis: $REDIS | Queue: $QUEUE"
        fi
    else
        echo -e "   ${RED}❌ Server is NOT responding${NC}"
        if [ -n "$HTTP_CODE" ] && [ "$HTTP_CODE" != "200" ]; then
            echo "   HTTP Status: $HTTP_CODE"
        fi
        if [ -n "$HEALTH_BODY" ]; then
            echo "   Response: $(echo "$HEALTH_BODY" | head -c 100)"
        fi
        echo "   Check: docker compose -f docker-compose.production.yml logs bot-api --tail 20"
    fi
    echo ""

    # 4. Check queue health
    echo "4️⃣  Queue health:"
    # Try direct Docker network access first (bypasses Nginx redirect)
    QUEUE_RESPONSE=$(docker exec examiner-bot-api curl -s http://localhost:3000/health/queue 2>/dev/null || curl -s -L -w "\n%{http_code}" http://localhost:3000/health/queue 2>/dev/null)

    # Check if response contains HTTP code (from curl -w)
    if echo "$QUEUE_RESPONSE" | grep -q "^[0-9]\{3\}$"; then
        # Response has HTTP code format
        QUEUE_HTTP_CODE=$(echo "$QUEUE_RESPONSE" | tail -1)
        QUEUE_BODY=$(echo "$QUEUE_RESPONSE" | head -n -1)
    else
        # Direct response from Docker exec (no HTTP code)
        QUEUE_HTTP_CODE="200"
        QUEUE_BODY="$QUEUE_RESPONSE"
    fi

    if [ "$QUEUE_HTTP_CODE" = "200" ] && echo "$QUEUE_BODY" | grep -q "initialized\|healthy"; then
        echo -e "   ${GREEN}✅ Queue is healthy${NC}"
        if command -v jq > /dev/null 2>&1 && [ -n "$QUEUE_BODY" ]; then
            WAITING=$(echo "$QUEUE_BODY" | jq -r '.waiting // 0' 2>/dev/null)
            ACTIVE=$(echo "$QUEUE_BODY" | jq -r '.active // 0' 2>/dev/null)
            echo "   Waiting: $WAITING | Active: $ACTIVE"
        fi
    else
        if [ "$QUEUE_HTTP_CODE" = "200" ]; then
            echo -e "   ${YELLOW}⚠️  Queue status unclear${NC}"
        else
            echo -e "   ${YELLOW}⚠️  Queue endpoint returned HTTP $QUEUE_HTTP_CODE${NC}"
        fi
    fi
    echo ""

else
    echo -e "${BLUE}💻 Local Development Mode${NC}"
    echo ""

    # 1. Check server process
    echo "1️⃣  Checking server process:"
    if ps aux | grep -q "[t]s-node-dev.*src/app"; then
        PID=$(ps aux | grep "[t]s-node-dev.*src/app" | awk '{print $2}' | head -1)
        CPU=$(ps aux | grep "[t]s-node-dev.*src/app" | awk '{print $3}' | head -1)
        MEM=$(ps aux | grep "[t]s-node-dev.*src/app" | awk '{print $4}' | head -1)
        echo -e "   ${GREEN}✅ Server is running${NC}"
        echo "   PID: $PID | CPU: ${CPU}% | Memory: ${MEM}%"
    else
        echo -e "   ${RED}❌ Server is NOT running${NC}"
        echo "   Start with: npm run dev"
    fi
    echo ""

    # 2. Check port
    echo "2️⃣  Checking port 3000:"
    if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        echo -e "   ${GREEN}✅ Port 3000 is open${NC}"
    else
        echo -e "   ${RED}❌ Port 3000 is NOT open${NC}"
    fi
    echo ""

    # 3. Health check
    echo "3️⃣  Health check API:"
    HEALTH_CHECK=$(curl -s http://localhost:3000/health 2>/dev/null)
    if echo "$HEALTH_CHECK" | grep -q "ok"; then
        echo -e "   ${GREEN}✅ Server is responding${NC}"
        UPTIME=$(echo "$HEALTH_CHECK" | python3 -c "import sys, json; print(f\"{json.load(sys.stdin)['uptime']:.1f} sec\")" 2>/dev/null || echo "N/A")
        echo "   Uptime: $UPTIME"
    else
        echo -e "   ${RED}❌ Server is NOT responding${NC}"
    fi
    echo ""

    # 4. Check ngrok
    echo "4️⃣  Checking ngrok:"
    if ps aux | grep -q "[n]grok http 3000"; then
        echo -e "   ${GREEN}✅ ngrok is running${NC}"
        NGROK_URL=$(curl -s http://localhost:4040/api/tunnels 2>/dev/null | python3 -c "import sys, json; data=json.load(sys.stdin); print(data['tunnels'][0]['public_url'])" 2>/dev/null || echo "")
        if [ ! -z "$NGROK_URL" ]; then
            echo "   URL: $NGROK_URL"
        fi
    else
        echo -e "   ${RED}❌ ngrok is NOT running${NC}"
        echo "   Start with: ngrok http 3000"
    fi
    echo ""
fi

# 5. Check .env file
echo "5️⃣  Checking configuration (.env):"
if [ -f ".env" ]; then
    echo -e "   ${GREEN}✅ .env file exists${NC}"

    # Check tokens (don't show values)
    if grep -q "TELEGRAM_BOT_TOKEN=.*[a-zA-Z0-9]" .env 2>/dev/null; then
        echo -e "   ${GREEN}✅ TELEGRAM_BOT_TOKEN is set${NC}"
    else
        echo -e "   ${RED}❌ TELEGRAM_BOT_TOKEN is NOT set${NC}"
    fi

    if grep -q "OPENAI_API_KEY=sk-" .env 2>/dev/null; then
        echo -e "   ${GREEN}✅ OPENAI_API_KEY is set${NC}"
    else
        echo -e "   ${RED}❌ OPENAI_API_KEY is NOT set or invalid format${NC}"
    fi

    if grep -q "WEBHOOK_URL=https://.*webhook" .env 2>/dev/null; then
        WEBHOOK_URL=$(grep "WEBHOOK_URL=" .env | cut -d'=' -f2)
        echo -e "   ${GREEN}✅ WEBHOOK_URL is set${NC}"
        echo "   URL: $WEBHOOK_URL"
    else
        echo -e "   ${YELLOW}⚠️  WEBHOOK_URL is NOT set or invalid format${NC}"
        if [ "$DOCKER_MODE" = true ]; then
            echo "   Should be: https://your-domain.com/webhook"
        else
            echo "   Should be: https://....ngrok-free.dev/webhook"
        fi
    fi
else
    echo -e "   ${RED}❌ .env file NOT found${NC}"
    echo "   Create with: cp .env.example .env"
fi
echo ""

# 6. Temporary files
echo "6️⃣  Temporary files:"
if [ -d "tmp" ]; then
    TMP_COUNT=$(find tmp -type f 2>/dev/null | wc -l | tr -d ' ')
    TMP_SIZE=$(du -sh tmp 2>/dev/null | cut -f1)
    if [ "$TMP_COUNT" -gt 0 ]; then
        echo -e "   ${YELLOW}⚠️  Files in tmp/: $TMP_COUNT ($TMP_SIZE)${NC}"
        if [ "$TMP_COUNT" -gt 50 ]; then
            echo "   Cleanup recommended: rm -rf tmp/*"
        fi
    else
        echo -e "   ${GREEN}✅ tmp/ is empty${NC}"
    fi
else
    echo -e "   ${RED}❌ tmp/ directory not found${NC}"
fi
echo ""

# 7. Summary
echo "=========================================="
echo "  📊 Summary"
echo "=========================================="

ALL_OK=true

if [ "$DOCKER_MODE" = true ]; then
    if ! docker compose -f docker-compose.production.yml ps 2>/dev/null | grep -q "Up"; then
        echo -e "${RED}❌ Docker containers are not running${NC}"
        ALL_OK=false
    fi

    # Try direct Docker network access first
    HEALTH_RESPONSE=$(docker exec examiner-bot-api curl -s http://localhost:3000/health 2>/dev/null || curl -s -L -w "\n%{http_code}" http://localhost:3000/health 2>/dev/null)

    # Check if response contains HTTP code
    if echo "$HEALTH_RESPONSE" | grep -q "^[0-9]\{3\}$"; then
        HEALTH_HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -1)
        HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | head -n -1)
    else
        HEALTH_HTTP_CODE="200"
        HEALTH_BODY="$HEALTH_RESPONSE"
    fi

    if [ "$HEALTH_HTTP_CODE" != "200" ] || ! echo "$HEALTH_BODY" | grep -q "healthy\|ok"; then
        echo -e "${RED}❌ Health check failed (HTTP $HEALTH_HTTP_CODE)${NC}"
        ALL_OK=false
    fi
else
    if ! ps aux | grep -q "[t]s-node-dev.*src/app"; then
        echo -e "${RED}❌ Server is not running${NC}"
        ALL_OK=false
    fi

    if ! lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        echo -e "${RED}❌ Port 3000 is closed${NC}"
        ALL_OK=false
    fi

    if ! ps aux | grep -q "[n]grok http 3000"; then
        echo -e "${YELLOW}⚠️  ngrok is not running (needed for local development)${NC}"
    fi
fi

if ! grep -q "TELEGRAM_BOT_TOKEN=.*[a-zA-Z0-9]" .env 2>/dev/null; then
    echo -e "${RED}❌ TELEGRAM_BOT_TOKEN is not configured${NC}"
    ALL_OK=false
fi

if ! grep -q "OPENAI_API_KEY=sk-" .env 2>/dev/null; then
    echo -e "${RED}❌ OPENAI_API_KEY is not configured${NC}"
    ALL_OK=false
fi

if $ALL_OK; then
    echo -e "${GREEN}✅ Everything is working perfectly!${NC}"
    echo ""
    echo "Bot is ready to work! 🚀"
else
    echo ""
    echo "Please fix the errors above for the bot to work correctly."
fi

echo ""
echo "=========================================="
echo "Command reference:"
if [ "$DOCKER_MODE" = true ]; then
    echo "  ./scripts/deploy.sh           - Initial deployment (first time)"
    echo "  ./scripts/deploy-code.sh - Update deployment (zero-downtime, recommended)"
    echo "  ./scripts/deploy-update.sh    - Update deployment (deprecated, with downtime)"
    echo "  docker compose ps            - Check containers"
    echo "  curl localhost/health        - Health check"
    echo "  curl localhost/status        - Status check"
    echo "  docker compose logs          - View logs"
else
    echo "  npm run dev                  - Start server"
    echo "  npm run webhook:info         - Check webhook"
    echo "  npm run webhook:set          - Set webhook"
    echo "  curl localhost:3000/health   - Health check"
fi
echo "=========================================="
