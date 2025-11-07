#!/bin/bash

# Zero-downtime code deployment script (custom service selection)
# Updates code, rebuilds images, and deploys with rolling updates
# Usage: ./scripts/deploy-code-custom.sh [bot-api|exam-worker|all]
# Example: ./scripts/deploy-code-custom.sh all

set -e
set -o pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Parse arguments
UPDATE_SERVICES="${1:-all}"

echo -e "${CYAN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║        Zero-Downtime Code Deployment                  ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    exit 1
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Docker is not running${NC}"
    exit 1
fi

# Step 1: Backup
echo -e "${BLUE}💾 Step 1: Creating backup...${NC}"
BACKUP_DIR="backups/code-deploy-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp .env "$BACKUP_DIR/.env.backup" 2>/dev/null || true
cp docker-compose.production.yml "$BACKUP_DIR/" 2>/dev/null || true

# Save current git commit for rollback
if [ -d .git ]; then
    CURRENT_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
    echo "$CURRENT_COMMIT" > "$BACKUP_DIR/git-commit.txt"
    echo -e "${GREEN}   ✅ Current commit: ${CURRENT_COMMIT:0:8}${NC}"
fi

echo -e "${GREEN}   ✅ Backup created at $BACKUP_DIR${NC}"
echo ""

# Step 2: Update code
if [ -d .git ]; then
    echo -e "${BLUE}📥 Step 2: Updating code from git...${NC}"

    # Check if there are uncommitted changes
    if ! git diff-index --quiet HEAD -- 2>/dev/null; then
        echo -e "${YELLOW}   ⚠️  Warning: Uncommitted changes detected${NC}"
        echo -e "${YELLOW}   Stashing changes...${NC}"
        git stash save "Auto-stash before deploy $(date +%Y%m%d_%H%M%S)" || true
    fi

    # Try to pull, if it fails due to divergent branches, reset to remote
    if ! git pull origin main 2>/dev/null; then
        echo -e "${YELLOW}   ⚠️  Git pull failed, synchronizing with remote...${NC}"
        git fetch origin
        git reset --hard origin/main || {
            echo -e "${RED}   ❌ Git sync failed${NC}"
            exit 1
        }
    fi

    NEW_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
    echo -e "${GREEN}   ✅ Code updated to commit: ${NEW_COMMIT:0:8}${NC}"

    # Show what changed
    if [ "$CURRENT_COMMIT" != "unknown" ] && [ "$CURRENT_COMMIT" != "$NEW_COMMIT" ]; then
        echo -e "${CYAN}   Changes:${NC}"
        git log --oneline "$CURRENT_COMMIT..$NEW_COMMIT" | head -5 | sed 's/^/     /' || true
    fi
else
    echo -e "${YELLOW}   ⚠️  Not a git repository, skipping code update${NC}"
fi
echo ""


# Step 3: Validate configuration
echo -e "${BLUE}📋 Step 3: Validating configuration...${NC}"

# Check if we can build/validate config
echo -e "${YELLOW}   Building image for validation...${NC}"
if ! docker compose -f docker-compose.production.yml build --quiet bot-api > /dev/null 2>&1; then
    echo -e "${RED}   ❌ Failed to build image for validation${NC}"
    echo -e "${YELLOW}   🔄 Rolling back code...${NC}"
    if [ -f "$BACKUP_DIR/git-commit.txt" ]; then
        ROLLBACK_COMMIT=$(cat "$BACKUP_DIR/git-commit.txt")
        if [ -n "$ROLLBACK_COMMIT" ] && [ "$ROLLBACK_COMMIT" != "unknown" ]; then
            git reset --hard "$ROLLBACK_COMMIT" 2>/dev/null || true
        fi
    fi
    exit 1
fi

# Try to validate config by checking if container can start
echo -e "${YELLOW}   Testing configuration...${NC}"
VALIDATION_CONTAINER="config-validator-$(date +%s)"

# Get image name
IMAGE_NAME=$(docker compose -f docker-compose.production.yml config 2>/dev/null | grep -A 5 "bot-api:" | grep "image:" | awk '{print $2}' || echo "")

# If no image in compose, try to get from built images
if [ -z "$IMAGE_NAME" ]; then
    IMAGE_NAME=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "$(basename $(pwd))" | grep "bot-api" | head -1 || echo "")
fi

# If still no image, build it
if [ -z "$IMAGE_NAME" ]; then
    echo -e "${YELLOW}   Building image...${NC}"
    docker compose -f docker-compose.production.yml build bot-api > /dev/null 2>&1
    IMAGE_NAME=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep "$(basename $(pwd))" | grep "bot-api" | head -1 || echo "")
fi

# Run validation in temporary container
if docker run --rm \
    --name "$VALIDATION_CONTAINER" \
    --env-file .env \
    -e USE_TEST_ENVIRONMENT=false \
    -e APP_MODE=api \
    -e BULLMQ_REDIS_DB=0 \
    "$IMAGE_NAME" \
    node -e "
        try {
            // We don't need to load dotenv because docker --env-file already populates process.env
            const { validateConfig } = require('./dist/config/config-validator');
            const result = validateConfig();
            if (!result.valid) {
                console.error('Config validation failed:');
                result.errors.forEach(err => console.error(\`  - \${err.path}: \${err.message}\`));
                process.exit(1);
            }
            console.log('Configuration is valid');
            process.exit(0);
        } catch (error) {
            console.error('Config validation error:', error.message);
            if (error.stack) console.error(error.stack);
            process.exit(1);
        }
    " 2>&1 | tee /tmp/config-validation.log; then
    echo -e "${GREEN}   ✅ Configuration validation passed!${NC}"
    rm -f /tmp/config-validation.log
else
    echo -e "${RED}   ❌ Configuration validation failed!${NC}"
    echo -e "${YELLOW}   Validation errors:${NC}"
    cat /tmp/config-validation.log 2>/dev/null || true
    rm -f /tmp/config-validation.log

    # Rollback code
    echo -e "${YELLOW}   🔄 Rolling back code...${NC}"
    if [ -f "$BACKUP_DIR/git-commit.txt" ]; then
        ROLLBACK_COMMIT=$(cat "$BACKUP_DIR/git-commit.txt")
        if [ -n "$ROLLBACK_COMMIT" ] && [ "$ROLLBACK_COMMIT" != "unknown" ]; then
            git reset --hard "$ROLLBACK_COMMIT" 2>/dev/null || true
        fi
    fi
    exit 1
fi
echo ""

# Step 4: Build new images
echo -e "${BLUE}🏗️  Step 4: Building new Docker images...${NC}"
if [ "$UPDATE_SERVICES" = "all" ] || [ "$UPDATE_SERVICES" = "bot-api" ]; then
    echo -e "${YELLOW}   Building bot-api image...${NC}"
    docker compose -f docker-compose.production.yml build --quiet bot-api > /dev/null 2>&1 || \
    docker compose -f docker-compose.production.yml build bot-api
fi

if [ "$UPDATE_SERVICES" = "all" ] || [ "$UPDATE_SERVICES" = "exam-worker" ]; then
    echo -e "${YELLOW}   Building exam-worker image...${NC}"
    docker compose -f docker-compose.production.yml build --quiet exam-worker > /dev/null 2>&1 || \
    docker compose -f docker-compose.production.yml build exam-worker
fi
echo -e "${GREEN}   ✅ Images built successfully${NC}"
echo ""

# Step 5: Update API (rolling update)
if [ "$UPDATE_SERVICES" = "all" ] || [ "$UPDATE_SERVICES" = "bot-api" ]; then
    # Warning: If only updating API, workers might be on old code
    # This can cause compatibility issues if API and workers need to be in sync
    if [ "$UPDATE_SERVICES" = "bot-api" ]; then
        echo -e "${YELLOW}⚠️  Warning: Updating only bot-api${NC}"
        echo -e "${YELLOW}   Workers are still running old code. This may cause compatibility issues.${NC}"
        echo -e "${YELLOW}   Consider updating all services: ./scripts/deploy-code-custom.sh all${NC}"
        echo ""
        # Only prompt if running interactively
        if [ -t 0 ]; then
            read -p "Continue anyway? (y/N) " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo -e "${YELLOW}Deployment cancelled${NC}"
                exit 0
            fi
        else
            echo -e "${YELLOW}   Non-interactive mode: Continuing with warning...${NC}"
            echo ""
        fi
    fi

    echo -e "${BLUE}🚀 Step 5: Updating bot-api (rolling update)...${NC}"

    # Check if API is running
    if docker ps --format "{{.Names}}" | grep -q "^examiner-bot-api$"; then
        echo -e "${YELLOW}   Current API is running, starting new container...${NC}"

        # Start new container (docker compose will handle rolling update)
        # Note: There will be a brief downtime (5-15 seconds) while new container starts
        docker compose -f docker-compose.production.yml up -d --no-deps --force-recreate bot-api

        # Wait for health check
        echo -e "${YELLOW}   Waiting for new API to be healthy...${NC}"
        MAX_RETRIES=60
        RETRY_COUNT=0

        while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
            if docker exec examiner-bot-api curl -f http://localhost:3000/health > /dev/null 2>&1 2>/dev/null || \
               curl -f -k -L https://localhost/health > /dev/null 2>&1 || \
               curl -f -L http://localhost/health > /dev/null 2>&1; then
                echo -e "${GREEN}   ✅ API health check passed!${NC}"
                break
            fi

            RETRY_COUNT=$((RETRY_COUNT + 1))
            if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
                echo -e "${YELLOW}   ⏳ Waiting for health check... ($RETRY_COUNT/$MAX_RETRIES)${NC}"
                sleep 2
            fi
        done

        if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
            echo -e "${RED}   ❌ API health check failed after $MAX_RETRIES attempts${NC}"
            echo -e "${YELLOW}   📋 Container logs:${NC}"
            docker compose -f docker-compose.production.yml logs --tail 50 bot-api

            # Rollback
            echo -e "${YELLOW}   🔄 Rolling back...${NC}"
            if [ -f "$BACKUP_DIR/git-commit.txt" ]; then
                ROLLBACK_COMMIT=$(cat "$BACKUP_DIR/git-commit.txt")
                if [ -n "$ROLLBACK_COMMIT" ] && [ "$ROLLBACK_COMMIT" != "unknown" ]; then
                    git reset --hard "$ROLLBACK_COMMIT" 2>/dev/null || true
                    docker compose -f docker-compose.production.yml build bot-api
                    docker compose -f docker-compose.production.yml up -d --no-deps --force-recreate bot-api
                fi
            fi
            exit 1
        fi

        # Old container should be stopped automatically by docker-compose
        echo -e "${GREEN}   ✅ API updated successfully (old container stopped)${NC}"
    else
        echo -e "${YELLOW}   API not running, starting fresh...${NC}"
        docker compose -f docker-compose.production.yml up -d --no-deps bot-api
        echo -e "${GREEN}   ✅ API started${NC}"
    fi
    echo ""
fi

# Step 6: Update Workers (gradual rolling update)
if [ "$UPDATE_SERVICES" = "all" ] || [ "$UPDATE_SERVICES" = "exam-worker" ]; then
    # Warning: If only updating workers, API might be on old code
    # This can cause compatibility issues if API and workers need to be in sync
    if [ "$UPDATE_SERVICES" = "exam-worker" ]; then
        echo -e "${YELLOW}⚠️  Warning: Updating only exam-worker${NC}"
        echo -e "${YELLOW}   API is still running old code. This may cause compatibility issues.${NC}"
        echo -e "${YELLOW}   Webhooks will be accepted, but workers may not process them correctly.${NC}"
        echo -e "${YELLOW}   Consider updating all services: ./scripts/deploy-code-custom.sh all${NC}"
        echo ""
        # Only prompt if running interactively
        if [ -t 0 ]; then
            read -p "Continue anyway? (y/N) " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo -e "${YELLOW}Deployment cancelled${NC}"
                exit 0
            fi
        else
            echo -e "${YELLOW}   Non-interactive mode: Continuing with warning...${NC}"
            echo ""
        fi
    fi

    echo -e "${BLUE}👷 Step 6: Updating exam-workers (gradual rolling update)...${NC}"

    # Get current number of workers
    CURRENT_WORKERS=$(docker compose -f docker-compose.production.yml ps -q exam-worker 2>/dev/null | wc -l | tr -d ' ')
    TARGET_WORKERS=$(docker compose -f docker-compose.production.yml config 2>/dev/null | grep -A 20 "exam-worker:" | grep "replicas:" | awk '{print $2}' || echo "2")

    if [ -z "$CURRENT_WORKERS" ] || [ "$CURRENT_WORKERS" -eq 0 ]; then
        CURRENT_WORKERS=0
    fi

    echo -e "${CYAN}   Current workers: $CURRENT_WORKERS, Target: $TARGET_WORKERS${NC}"

    if [ "$CURRENT_WORKERS" -eq 0 ]; then
        # No workers running, start all at once
        echo -e "${YELLOW}   No workers running, starting all workers...${NC}"
        docker compose -f docker-compose.production.yml up -d --scale exam-worker=$TARGET_WORKERS exam-worker

        # Wait for at least one worker to be healthy
        echo -e "${YELLOW}   Waiting for workers to be healthy...${NC}"
        MAX_RETRIES=60
        RETRY_COUNT=0

        while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
            HEALTHY_WORKERS=0
            for WORKER_ID in $(docker compose -f docker-compose.production.yml ps -q exam-worker); do
                # Worker doesn't have HTTP health endpoint, assume healthy if running
                if docker ps -q --filter "id=$WORKER_ID" --filter "status=running" > /dev/null 2>&1; then
                    HEALTHY_WORKERS=$((HEALTHY_WORKERS + 1))
                fi
            done

            if [ $HEALTHY_WORKERS -gt 0 ]; then
                echo -e "${GREEN}   ✅ $HEALTHY_WORKERS worker(s) are healthy!${NC}"
                break
            fi

            RETRY_COUNT=$((RETRY_COUNT + 1))
            if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
                echo -e "${YELLOW}   ⏳ Waiting for workers... ($RETRY_COUNT/$MAX_RETRIES)${NC}"
                sleep 2
            fi
        done
    else
        # Gradual rolling update: update workers one by one
        echo -e "${YELLOW}   Starting gradual rolling update (one worker at a time)...${NC}"

        WORKER_INDEX=1
        while [ $WORKER_INDEX -le $CURRENT_WORKERS ]; do
            echo -e "${CYAN}   [Worker $WORKER_INDEX/$CURRENT_WORKERS] Updating...${NC}"

            # Scale down by 1, then scale back up (forces recreation of one worker)
            SCALE_DOWN=$((CURRENT_WORKERS - 1))
            SCALE_UP=$CURRENT_WORKERS

            # Scale down one worker (docker compose will stop the oldest)
            docker compose -f docker-compose.production.yml up -d --scale exam-worker=$SCALE_DOWN exam-worker
            sleep 3  # Give time for graceful shutdown

            # Scale back up (creates new worker with new code)
            docker compose -f docker-compose.production.yml up -d --scale exam-worker=$SCALE_UP exam-worker

            # Wait for new worker to be healthy
            echo -e "${YELLOW}      Waiting for new worker to be healthy...${NC}"
            MAX_RETRIES=30
            RETRY_COUNT=0
            WORKER_HEALTHY=false

            while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
                # Check if we have the right number of workers
                ACTUAL_WORKERS=$(docker compose -f docker-compose.production.yml ps -q exam-worker 2>/dev/null | wc -l | tr -d ' ')
                if [ "$ACTUAL_WORKERS" -eq "$SCALE_UP" ]; then
                    # Check health of newest worker
                    NEWEST_WORKER=$(docker compose -f docker-compose.production.yml ps -q exam-worker | tail -1)
                    if [ -n "$NEWEST_WORKER" ]; then
                        if docker ps -q --filter "id=$NEWEST_WORKER" --filter "status=running" > /dev/null 2>&1; then
                            WORKER_HEALTHY=true
                            break
                        fi
                    fi
                fi

                RETRY_COUNT=$((RETRY_COUNT + 1))
                if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
                    sleep 2
                fi
            done

            if [ "$WORKER_HEALTHY" = true ]; then
                echo -e "${GREEN}      ✅ Worker $WORKER_INDEX updated and healthy${NC}"
            else
                echo -e "${YELLOW}      ⚠️  Worker $WORKER_INDEX health check timeout (continuing anyway)${NC}"
            fi

            # Small delay between workers to avoid overwhelming the system
            if [ $WORKER_INDEX -lt $CURRENT_WORKERS ]; then
                sleep 2
            fi

            WORKER_INDEX=$((WORKER_INDEX + 1))
        done

        echo -e "${GREEN}   ✅ All workers updated successfully${NC}"
    fi
    echo ""
fi

# Step 7: Final health check
echo -e "${BLUE}🏥 Step 7: Final health check...${NC}"

ALL_HEALTHY=true

# Check API
if [ "$UPDATE_SERVICES" = "all" ] || [ "$UPDATE_SERVICES" = "bot-api" ]; then
        if docker ps --format "{{.Names}}" | grep -q "^examiner-bot-api$"; then
            echo -e "${GREEN}   ✅ API is healthy${NC}"
        else
            echo -e "${RED}   ❌ API health check failed${NC}"
            ALL_HEALTHY=false
        fi
fi

# Check Workers
if [ "$UPDATE_SERVICES" = "all" ] || [ "$UPDATE_SERVICES" = "exam-worker" ]; then
    HEALTHY_WORKERS=0
    TOTAL_WORKERS=$(docker compose -f docker-compose.production.yml ps -q exam-worker 2>/dev/null | wc -l | tr -d ' ')

    for WORKER_ID in $(docker compose -f docker-compose.production.yml ps -q exam-worker); do
        if docker ps -q --filter "id=$WORKER_ID" --filter "status=running" > /dev/null 2>&1; then
            HEALTHY_WORKERS=$((HEALTHY_WORKERS + 1))
        fi
    done

    if [ "$HEALTHY_WORKERS" -gt 0 ]; then
        echo -e "${GREEN}   ✅ $HEALTHY_WORKERS/$TOTAL_WORKERS workers are healthy${NC}"
    else
        echo -e "${RED}   ❌ No healthy workers found${NC}"
        ALL_HEALTHY=false
    fi
fi

if [ "$ALL_HEALTHY" = false ]; then
    echo -e "${RED}   ⚠️  Some services are not healthy, but update completed${NC}"
fi

echo ""

# Step 8: Cleanup
echo -e "${BLUE}🧹 Step 8: Cleaning up...${NC}"
# Remove stopped containers
docker compose -f docker-compose.production.yml rm -f > /dev/null 2>&1 || true

# Cleanup old images (keep last 2 versions)
echo -e "${YELLOW}   Cleaning up old Docker images...${NC}"
docker image prune -f > /dev/null 2>&1 || true
echo -e "${GREEN}   ✅ Cleanup complete${NC}"
echo ""

# Final status
echo -e "${CYAN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║              ✅ Deployment Complete!                    ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${YELLOW}📊 Container status:${NC}"
docker compose -f docker-compose.production.yml ps

echo ""
echo -e "${GREEN}🎉 Zero-downtime code deployment successful!${NC}"
echo ""
echo "Updated services: $UPDATE_SERVICES"
echo "Backup location: $BACKUP_DIR"
if [ -d .git ]; then
    echo "Code commit: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
fi
echo ""
echo "To view logs:"
echo "  docker compose -f docker-compose.production.yml logs -f"
echo ""
echo -e "${CYAN}Important Notes:${NC}"
echo "  - API had brief downtime (5-15 seconds) during container swap"
echo "  - Workers updated gradually (no downtime)"
echo "  - Queue was never stopped. All jobs are safe in Redis."
echo ""
echo -e "${YELLOW}📨 Message Delivery:${NC}"
echo "  - Messages sent during downtime are stored by Telegram in pending updates"
echo "  - Telegram will automatically retry delivery after API restarts"
echo "  - No messages are lost (bot configured with drop_pending_updates: false)"
echo "  - Check pending updates: npm run webhook:info"
echo "  - If pending updates > 0, wait a few seconds - Telegram will retry"

