#!/usr/bin/env bash

# .devcontainer/initialize.sh v.1.2.0

# This script runs on the host before the Dev Container is created to set up the Docker environment.

set -euo pipefail

echo "Welcome to Matterbridge Plugin Dev Container (initialize.sh)"
echo ""

echo "1.initialize - Creating the Matterbridge Docker network..."
docker network inspect matterbridge >/dev/null 2>&1 || docker network create matterbridge

echo "2.initialize - Pulling the base image..."
docker pull node:24-trixie-slim

echo "3.initialize - Initialization completed!"
