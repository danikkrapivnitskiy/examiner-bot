#!/bin/bash

# Zero-downtime code deployment (updates all services)
# Usage: ./scripts/deploy-code.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Use the main deployment script with 'all' services
exec "$SCRIPT_DIR/deploy-code-custom.sh" all

