#!/usr/bin/env bash

# .devcontainer/bun/post-start.sh v.2.0.0

# This script runs after the Dev Container is started to set up the dev container environment.

set -euo pipefail

echo "Welcome to Matterbridge Plugin Dev Container (post-start.sh)"
DISTRO=$(awk -F= '/^PRETTY_NAME=/{gsub(/"/, "", $2); print $2}' /etc/os-release)
CODENAME=$(awk -F= '/^VERSION_CODENAME=/{print $2}' /etc/os-release)
echo "Distro: $DISTRO ($CODENAME)"
echo "User: $(whoami)"
echo "Hostname: $(hostname)"
echo "Architecture: $(uname -m)"
echo "Kernel Version: $(uname -r)"
echo "Uptime: $(uptime -p || echo 'unavailable')"
echo "Date: $(date)"
echo "Bun version: $(bun -v)"
echo "Bun global cache: ${HOME}/.bun/install/cache"
echo ""

echo "1.post-start - Installing the plugin dependencies..."
[ -f package-lock.json ] && mv package-lock.json package-lock.json.bak || true
bun install
[ -f package-lock.json.bak ] && mv package-lock.json.bak package-lock.json || true

echo "2.post-start - Linking Matterbridge..."
if ! bun link matterbridge; then
	echo "Retrying link with elevated permissions..."
	sudo bun link matterbridge
	sudo chown -R bun:bun ./node_modules
fi

echo "3.post-start - Building the plugin..."
bun run build

echo "4.post-start - Checking for the plugin frontend..."
if [ -f apps/frontend/package.json ]; then
	echo "4.post-start - Building the plugin frontend..."
	cd apps/frontend
	[ -f package-lock.json ] && mv package-lock.json package-lock.json.bak || true
	bun install && bun run build
	[ -f package-lock.json.bak ] && mv package-lock.json.bak package-lock.json || true
	cd ../..
fi

echo "5.post-start - Post start setup completed!"
