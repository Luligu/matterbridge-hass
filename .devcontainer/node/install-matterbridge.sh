#!/usr/bin/env bash

# .devcontainer/node/install-matterbridge.sh v.2.0.0

# This script globally installs Matterbridge from the given branch (main or dev).
# To be used only inside the Dev Container with the mounted matterbridge volume.

set -euo pipefail

BRANCH="${1:?Usage: install-matterbridge.sh <main|dev>}"

echo "1.install-matterbridge - Installing Matterbridge from the $BRANCH branch..."
cd /
if [ ! -d "/workspaces" ]; then
  echo "Directory /workspaces does not exist. Exiting."
  exit 1
fi

echo "2.install-matterbridge - Preparing Matterbridge directory..."
sudo chown -R node:node matterbridge
sudo chmod g+s matterbridge
sudo rm -rf matterbridge/* matterbridge/.[!.]* matterbridge/..?*

echo "3.install-matterbridge - Cloning Matterbridge from the $BRANCH branch..."
# Shallow clone for speed (history not needed inside dev container). Remove --depth if full history required.
git clone --depth 1 --single-branch --no-tags -b "$BRANCH" https://github.com/Luligu/matterbridge.git matterbridge
cd matterbridge

echo "4.install-matterbridge - Setting Matterbridge version..."
node scripts/version.mjs git

echo "5.install-matterbridge - Installing Matterbridge dependencies and building..."
npm ci --no-fund --no-audit && npm run build

echo "6.install-matterbridge - Installing Matterbridge frontend dependencies and building..."
cd apps/frontend && npm ci --no-fund --no-audit && npm run build && cd ../..

echo "7.install-matterbridge - Installing Matterbridge globally..."
sudo npm link --no-fund --no-audit

echo "8.install-matterbridge - Matterbridge has been installed from the $BRANCH branch."
sudo rm -rf .agents .cache .claude .codex .devcontainer .git .github .vscode docker docs reflector screenshots scripts systemd
