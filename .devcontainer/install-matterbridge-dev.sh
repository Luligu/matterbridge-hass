#!/bin/bash

# install-matterbridge-dev.sh

# This script globally installs Matterbridge from the dev branch.
# To be used only inside the Dev Container with the mounted matterbridge volume.

echo "Installing Matterbridge from the dev branch..."
set -e
cd /
if [ ! -d "/workspaces" ]; then
  echo "Directory /workspaces does not exist. Exiting."
  exit 1
fi
sudo chown -R node:node matterbridge
sudo chmod g+s matterbridge
sudo rm -rf matterbridge/* matterbridge/.[!.]* matterbridge/..?*
# Shallow clone for speed (history not needed inside dev container). Remove --depth if full history required.
git clone --depth 1 --single-branch --no-tags -b dev https://github.com/Luligu/matterbridge.git matterbridge
cd matterbridge
SHA7=$(git rev-parse --short=7 HEAD) && BASE_VERSION=$(node -p "require('./package.json').version.split('-')[0]") && npm pkg set version="${BASE_VERSION}-git-${SHA7}"
npm ci --no-fund --no-audit
npm run build
npm install . --global --no-fund --no-audit
rm -rf .cache .devcontainer .git .github .vscode docker docs reflector screenshots scripts systemd
echo "Matterbridge has been installed from the dev branch."
