#!/usr/bin/env bash

# .devcontainer/post-create.sh v.1.2.0

# This script runs after the Dev Container is created to set up the dev container environment.

set -euo pipefail

echo "Welcome to Matterbridge Plugin Dev Container (post-create.sh)"
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
echo "Npm cache: $(npm config get cache)"
echo "Bun version: $(bun -v)"
echo "Bun global cache: ${HOME}/.bun/install/cache"
echo ""

echo "1.post-create - Creating directories..."
sudo mkdir -p /home/node/Matterbridge /home/node/.matterbridge /home/node/.mattercert
sudo mkdir -p /home/node/.claude /home/node/.codex /home/node/.agents /home/node/.npm /home/node/.bash-cache /home/node/.bun/install/cache

echo "2.post-create - Setting permissions..."
sudo chown -R node:node . /home/node/Matterbridge /home/node/.matterbridge /home/node/.mattercert
sudo chown -R node:node /home/node/.claude /home/node/.codex /home/node/.agents /home/node/.npm /home/node/.bash-cache /home/node/.bun

echo "3.post-create - Building Matterbridge..."
sudo chmod +x .devcontainer/install-matterbridge-*.sh
# Use this for the main branch:
# .devcontainer/install-matterbridge-main.sh
# Use this for the dev branch:
.devcontainer/install-matterbridge-dev.sh

echo "4.post-create - Installing the plugin dependencies..."
npm install --no-fund --no-audit

echo "5.post-create - Linking Matterbridge..."
if ! npm link matterbridge --no-fund --no-audit; then
	echo "Retrying link with elevated permissions..."
	sudo npm link matterbridge --no-fund --no-audit
	sudo chown -R node:node ./node_modules
fi

echo "6.post-create - Building the plugin..."
npm run build

echo "7.post-create - Adding the plugin to Matterbridge..."
npm run add

echo "8.post-create - Checking for outdated packages..."
npm outdated || true

echo "9.post-create - Post create setup completed!"
