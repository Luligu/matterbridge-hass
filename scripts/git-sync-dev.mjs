/**
 * git-sync-dev.mjs
 * Version: 1.0.0
 *
 * Syncs the dev branch with origin/main via merge or rebase, after creating
 * a timestamped local backup branch and fetching from origin.
 *
 * Usage:
 *   node scripts/git-sync-dev.mjs merge
 *   node scripts/git-sync-dev.mjs rebase
 */

import { execFileSync } from 'node:child_process';

/**
 * Executes Git with inherited standard input/output.
 *
 * @param {string[]} args Git command arguments.
 * @returns {void}
 */
function git(args) {
  execFileSync('git', args, {
    stdio: 'inherit',
    shell: false,
  });
}

/**
 * Returns a filesystem- and Git-ref-safe local timestamp.
 *
 * @returns {string} Timestamp formatted as YYYYMMDD-HHmmss.
 */
function createTimestamp() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

const operation = process.argv[2];

if (operation !== 'merge' && operation !== 'rebase') {
  throw new Error('Usage: node scripts/git-sync-dev.mjs <merge|rebase>');
}

const backupBranch = `dev-backup-${createTimestamp()}`;

git(['fetch', 'origin']);
git(['switch', 'dev']);
git(['branch', backupBranch]);

console.log(`Created backup branch: ${backupBranch}`);

if (operation === 'merge') {
  git(['merge', 'origin/main']);
  git(['push', 'origin', 'dev']);
} else {
  git(['rebase', 'origin/main']);
  git(['push', '--force-with-lease', 'origin', 'dev']);
}
