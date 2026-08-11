#!/usr/bin/env bash

# .devcontainer/install-matterbridge-main.sh v.1.2.0

# This script globally installs Matterbridge from the main branch.
# To be used only inside the Dev Container with the mounted matterbridge volume.

set -euo pipefail

echo "1.install-matterbridge-main - Installing Matterbridge from the main branch..."
cd /
if [ ! -d "/workspaces" ]; then
  echo "Directory /workspaces does not exist. Exiting."
  exit 1
fi

echo "2.install-matterbridge-main - Preparing Matterbridge directory..."
sudo chown -R node:node matterbridge
sudo chmod g+s matterbridge
sudo rm -rf matterbridge/* matterbridge/.[!.]* matterbridge/..?*

echo "3.install-matterbridge-main - Cloning Matterbridge from the main branch..."
# Shallow clone for speed (history not needed inside dev container). Remove --depth if full history required.
git clone --depth 1 --single-branch --no-tags https://github.com/Luligu/matterbridge.git matterbridge
cd matterbridge

echo "4.install-matterbridge-main - Setting Matterbridge version..."
SHA7=$(git rev-parse --short=7 HEAD) && BASE_VERSION=$(node -p "require('./package.json').version.split('-')[0]") && npm pkg set version="${BASE_VERSION}-git-${SHA7}"

echo "5.install-matterbridge-main - Installing Matterbridge dependencies and building..."
npm ci --no-fund --no-audit && npm run build
# bun install --no-fund --no-audit && bun run build

echo "6.install-matterbridge-main - Building Matterbridge frontend..."
cd apps/frontend && npm ci --no-fund --no-audit && npm run build && cd ../..
# cd apps/frontend && bun install --no-fund --no-audit && bun run build && cd ../..

echo "7.install-matterbridge-main - Installing Matterbridge globally..."
sudo npm install . --global --no-fund --no-audit
# bun link
sudo rm -rf .agents .cache .claude .codex .devcontainer .git .github .vscode docker docs reflector screenshots scripts systemd

echo "8.install-matterbridge-main - Matterbridge has been installed from the main branch."
