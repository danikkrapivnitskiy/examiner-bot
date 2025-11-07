#!/bin/bash

# Zero-downtime configuration update (updates all services)
# Usage: ./scripts/update-config.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Use the main update script with 'all' services
exec "$SCRIPT_DIR/update-config-custom.sh" all

