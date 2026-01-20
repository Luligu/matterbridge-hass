#!/usr/bin/env bash

# postCreateCommand.sh

# This script runs after the Dev Container is created to set up the dev container environment.

set -euo pipefail

echo "1 - Installing updates and scripts..."
sudo npm install -g npm npm-check-updates shx cross-env

echo "2 - Building Matterbridge..."
sudo chmod +x .devcontainer/install-matterbridge-*.sh
# Use this for the main branch: .devcontainer/install-matterbridge-main.sh
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
