#!/bin/bash
# This script globally installs Matterbridge from the dev branch.
# To be used inside the Dev Container only.
set -e

rm -rf matterbridge
git clone -b dev https://github.com/Luligu/matterbridge.git matterbridge
cd matterbridge
npm ci
npm run build
npm pack
npm install matterbridge-*.tgz --global --omit=dev --omit=optional
cd ..
rm -rf matterbridge
