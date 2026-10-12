/**
 * build-frontend.mjs
 * Version: 1.0.0
 *
 * Copies the plugin page (apps/frontend/index.html) to apps/frontend/build/index.html,
 * where Matterbridge looks for a plugin frontend and serves it at /plugins/matterbridge-hass/.
 *
 * Usage:
 *   node scripts/build-frontend.mjs
 */

import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
mkdirSync(resolve(root, 'apps', 'frontend', 'build'), { recursive: true });
copyFileSync(resolve(root, 'apps', 'frontend', 'index.html'), resolve(root, 'apps', 'frontend', 'build', 'index.html'));
