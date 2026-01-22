#!/usr/bin/env bash

# postCreateCommand.sh

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

echo "1 - Installing updates and scripts..."
npm install --global --no-fund --no-audit npm npm-check-updates shx cross-env 

echo "2 - Building Matterbridge..."
sudo chmod +x .devcontainer/install-matterbridge-*.sh
# Use this for the main branch: 
# .devcontainer/install-matterbridge-main.sh
# Use this for the dev branch:
.devcontainer/install-matterbridge-dev.sh

echo "3 - Creating directories..."
sudo mkdir -p /home/node/Matterbridge /home/node/.matterbridge /home/node/.mattercert

echo "4 - Setting permissions..."
sudo chown -R node:node . /home/node/Matterbridge /home/node/.matterbridge /home/node/.mattercert

echo "5 - Building the package..."
npm install --no-fund --no-audit
npm link matterbridge --no-fund --no-audit
npm run build
npm run matterbridge:add
npm outdated || true

echo "6 - Setup completed!"
