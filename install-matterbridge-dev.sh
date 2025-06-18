#!/bin/bash
# install-matterbridge-dev.sh
# This script globally installs Matterbridge from the dev branch.
# To be used inside the Dev Container only with the mounted matterbridge volume.
set -e
sudo chown -R node:node matterbridge
sudo chmod g+s matterbridge
rm -rf matterbridge/* matterbridge/.[!.]* matterbridge/..?*
git clone -b dev https://github.com/Luligu/matterbridge.git matterbridge
cd matterbridge
npm ci
npm run build
npm install . --global
rm -rf .git .github .vscode
cd ..
