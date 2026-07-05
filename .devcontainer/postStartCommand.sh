#!/usr/bin/env bash

# postStartCommand.sh v. 1.0.1

# This script runs after the Dev Container is started to set up the dev container environment.

set -euo pipefail

echo "Welcome to Matterbridge Plugin Dev Container"
DISTRO=$(awk -F= '/^PRETTY_NAME=/{gsub(/"/, "", $2); print $2}' /etc/os-release)
CODENAME=$(awk -F= '/^VERSION_CODENAME=/{print $2}' /etc/os-release)
echo "Distro: $DISTRO ($CODENAME)"
echo "User: $(whoami)"
echo "Hostname: $(hostname)"
echo "Architecture: $(uname -m)"
echo "Kernel Version: $(uname -r)"
echo "Uptime: $(uptime -p || echo 'unavailable')"
echo "Date: $(date)"
echo "Node.js version: $(node -v)"
echo "Npm version: $(npm -v)"
echo ""

echo "1 - Installing the plugin dependencies..."
npm install --no-fund --no-audit

echo "2 - Linking Matterbridge..."
npm link matterbridge --no-fund --no-audit

echo "3 - Building the plugin..."
npm run build

echo "4 - Post start setup completed!"
