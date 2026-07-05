#!/usr/bin/env bash

# postCreateCommand.sh v. 1.0.1

# This script runs after the Dev Container is created to set up the dev container environment.

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

echo "1 - Building Matterbridge..."
sudo chmod +x .devcontainer/install-matterbridge-*.sh
# Use this for the main branch:
# .devcontainer/install-matterbridge-main.sh
# Use this for the dev branch:
.devcontainer/install-matterbridge-dev.sh

echo "2 - Creating directories..."
sudo mkdir -p /home/node/Matterbridge /home/node/.matterbridge /home/node/.mattercert
sudo mkdir -p /home/node/.claude /home/node/.codex

echo "3 - Setting permissions..."
sudo chown -R node:node . /home/node/Matterbridge /home/node/.matterbridge /home/node/.mattercert
sudo chown -R node:node /home/node/.claude /home/node/.codex

echo "4 - Installing the plugin dependencies..."
npm install --no-fund --no-audit

echo "5 - Linking Matterbridge..."
npm link matterbridge --no-fund --no-audit

echo "6 - Building the plugin..."
npm run build

echo "7 - Adding the plugin to Matterbridge..."
npm run add

echo "8 - Checking for outdated packages..."
npm outdated || true

echo "9 - Post create setup completed!"
