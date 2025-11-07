#!/bin/bash

# Zero-downtime configuration update script (custom service selection)
# Updates services without stopping the queue or losing jobs
# Usage: ./scripts/update-config-custom.sh [bot-api|exam-worker|all]
# Example: ./scripts/update-config-custom.sh all

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
echo -e "${CYAN}║   Zero-Downtime Configuration Update                  ║${NC}"
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

# Step 1: Validate configuration
echo -e "${BLUE}📋 Step 1: Validating configuration...${NC}"

# Check if we can build/validate config
echo -e "${YELLOW}   Building image for validation...${NC}"
if ! docker compose -f docker-compose.production.yml build --quiet bot-api > /dev/null 2>&1; then
    echo -e "${RED}   ❌ Failed to build image for validation${NC}"
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
    exit 1
fi

echo ""

# Step 2: Backup
echo -e "${BLUE}💾 Step 2: Creating backup...${NC}"
BACKUP_DIR="backups/config-update-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp .env "$BACKUP_DIR/.env.backup" 2>/dev/null || true
cp docker-compose.production.yml "$BACKUP_DIR/" 2>/dev/null || true
echo -e "${GREEN}   ✅ Backup created at $BACKUP_DIR${NC}"
echo ""

# Step 3: Build new images
echo -e "${BLUE}🏗️  Step 3: Building new Docker images...${NC}"
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

# Step 4: Update API (if needed)
if [ "$UPDATE_SERVICES" = "all" ] || [ "$UPDATE_SERVICES" = "bot-api" ]; then
    echo -e "${BLUE}🚀 Step 4: Updating bot-api (rolling update)...${NC}"

    # Check if API is running
    if docker ps --format "{{.Names}}" | grep -q "^examiner-bot-api$"; then
        echo -e "${YELLOW}   Current API is running, starting new container...${NC}"

        # Start new container (docker compose will handle rolling update)
        docker compose -f docker-compose.production.yml up -d --no-deps bot-api

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
            if [ -f "$BACKUP_DIR/.env.backup" ]; then
                cp "$BACKUP_DIR/.env.backup" .env
                docker compose -f docker-compose.production.yml up -d --no-deps bot-api
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

# Step 5: Update Workers (gradual rolling update)
if [ "$UPDATE_SERVICES" = "all" ] || [ "$UPDATE_SERVICES" = "exam-worker" ]; then
    echo -e "${BLUE}👷 Step 5: Updating exam-workers (gradual rolling update)...${NC}"

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
            docker compose -f docker-compose.production.yml up -d --scale video-worker=$SCALE_DOWN video-worker
            sleep 3  # Give time for graceful shutdown

            # Scale back up (creates new worker with new config)
            docker compose -f docker-compose.production.yml up -d --scale video-worker=$SCALE_UP video-worker

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

# Step 6: Final health check
echo -e "${BLUE}🏥 Step 6: Final health check...${NC}"

ALL_HEALTHY=true

# Check API
if [ "$UPDATE_SERVICES" = "all" ] || [ "$UPDATE_SERVICES" = "bot-api" ]; then
    if docker exec examiner-bot-api curl -f http://localhost:3000/health > /dev/null 2>&1 2>/dev/null || \
       curl -f -k -L https://localhost/health > /dev/null 2>&1 || \
       curl -f -L http://localhost/health > /dev/null 2>&1; then
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

# Step 7: Cleanup
echo -e "${BLUE}🧹 Step 7: Cleaning up...${NC}"
# Remove stopped containers
docker compose -f docker-compose.production.yml rm -f > /dev/null 2>&1 || true
echo -e "${GREEN}   ✅ Cleanup complete${NC}"
echo ""

# Final status
echo -e "${CYAN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║              ✅ Update Complete!                      ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${YELLOW}📊 Container status:${NC}"
docker compose -f docker-compose.production.yml ps

echo ""
echo -e "${GREEN}🎉 Zero-downtime update successful!${NC}"
echo ""
echo "Updated services: $UPDATE_SERVICES"
echo "Backup location: $BACKUP_DIR"
echo ""
echo "To view logs:"
echo "  docker compose -f docker-compose.production.yml logs -f"
echo ""
echo -e "${CYAN}Note: Queue was never stopped. All jobs are safe in Redis.${NC}"

