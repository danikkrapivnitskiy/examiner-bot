#!/bin/bash

# Build and push Docker image to Docker Hub (Manual)
# Usage: ./scripts/docker-build-push.sh [DOCKER_USER]
#
# Note: This script is for manual Docker Hub pushes
# CI/CD no longer pushes to Docker Hub automatically (see .github/workflows/ci.yml)
# Use this script if you need to push images manually for multi-server deployments

set -e

# Get Docker Hub username from argument or environment variable
DOCKER_USER=${1:-${DOCKER_USER:-""}}
DOCKER_IMAGE="examiner-bot"

# Check if DOCKER_USER is provided
if [ -z "$DOCKER_USER" ]; then
  echo "❌ Error: DOCKER_USER is required"
  echo "Usage: ./scripts/docker-build-push.sh <DOCKER_USER>"
  echo "   or: DOCKER_USER=yourusername ./scripts/docker-build-push.sh"
  exit 1
fi

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
if [ -z "$VERSION" ]; then
  echo "❌ Error: Could not extract version from package.json"
  exit 1
fi

# Get git commit SHA
VCS_REF=$(git rev-parse HEAD 2>/dev/null || echo "local")
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Get repository URL
REPOSITORY_URL=$(git config --get remote.origin.url 2>/dev/null | sed 's/\.git$//' | sed 's|git@github.com:|https://github.com/|' || echo "https://github.com/yourusername/examiner-bot")

echo "Building Docker image..."
echo "  User: $DOCKER_USER"
echo "  Image: $DOCKER_IMAGE"
echo "  Version: $VERSION"
echo "  Repository: $REPOSITORY_URL"
echo ""

# Build image with metadata
docker build \
  --target production \
  --build-arg BUILD_DATE="$BUILD_DATE" \
  --build-arg VCS_REF="$VCS_REF" \
  --build-arg VERSION="$VERSION" \
  --build-arg REPOSITORY_URL="$REPOSITORY_URL" \
  -t "$DOCKER_USER/$DOCKER_IMAGE:$VERSION" \
  -t "$DOCKER_USER/$DOCKER_IMAGE:latest" \
  .

echo ""
echo "✅ Build completed successfully!"
echo ""
read -p "Do you want to push to Docker Hub? (y/N) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "Pushing images to Docker Hub..."

  # Check if logged in to Docker Hub
  if ! docker info | grep -q "Username"; then
    echo "⚠️  Not logged in to Docker Hub"
    echo "Please run: docker login"
    exit 1
  fi

  docker push "$DOCKER_USER/$DOCKER_IMAGE:$VERSION"
  docker push "$DOCKER_USER/$DOCKER_IMAGE:latest"

  echo ""
  echo "✅ Push completed successfully!"
  echo ""
  echo "Images pushed:"
  echo "  - $DOCKER_USER/$DOCKER_IMAGE:$VERSION"
  echo "  - $DOCKER_USER/$DOCKER_IMAGE:latest"
else
  echo "Skipping push. Images built locally:"
  echo "  - $DOCKER_USER/$DOCKER_IMAGE:$VERSION"
  echo "  - $DOCKER_USER/$DOCKER_IMAGE:latest"
fi

