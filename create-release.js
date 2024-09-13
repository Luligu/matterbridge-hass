/* eslint-disable no-console */

/*
Add the following scripts to package.json file:
    "prepublishOnly": "npm run lint && npm run test && npm run cleanBuild",
    "npmPublish": "npm publish",
    "gitPublish": "npm run lint && npm run test && npm run cleanBuild && node create-release.js",
    "preversion": "npm run lint && npm run test && npm run cleanBuild",
    "postversion": "git push && git push --tags && node create-release.js",
    "version:patch": "npm version patch",
    "version:minor": "npm version minor",
    "version:major": "npm version major",
*/

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import readline from 'readline';

// Get the latest tag
let tag = execSync('git describe --tags --abbrev=0').toString().trim();
if (tag.startsWith('v')) {
  tag = tag.substring(1);
}

// Read the changelog file
const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
const changelog = readFileSync(changelogPath, 'utf8');

// Extract the relevant section from the changelog
const changelogSection = extractChangelogSection(changelog, tag);

const title = `Release ${tag}`;
const notes = `Release notes for version ${tag}\n\n## [${tag}] ${changelogSection}`;

// Log the release details
console.log(`Creating release ${tag} with the following details:\nTitle:\n${title}\nNotes:\n${notes}`);

// Write the release notes to a temporary file
const notesFilePath = path.join(process.cwd(), 'release-notes.md');
writeFileSync(notesFilePath, notes);

// Wait for user input before proceeding
await pressAnyKey();

// Create the release using the temporary file
execSync(`gh release create ${tag} -t "${title}" -F "${notesFilePath}"`, { stdio: 'inherit' });

// Clean up the temporary file
unlinkSync(notesFilePath);

/**
 * Extracts the relevant section from the changelog for the given tag.
 * Assumes that each version section in the changelog starts with a heading like "## [tag]".
 * @param {string} changelog - The content of the changelog file.
 * @param {string} tag - The tag for which to extract the changelog section.
 * @returns {string} - The extracted changelog section.
 */
function extractChangelogSection(changelog, tag) {
  const regex = new RegExp(`## \\[${tag}\\](.*?)(## \\[|$)`, 's');
  const match = changelog.match(regex);
  return match ? match[1].trim() : 'No changelog entry found for this version.';
}

/**
 * Waits for the user to press any key.
 * @returns {Promise<void>}
 */
function pressAnyKey() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question('Press any key to continue...', () => {
      rl.close();
      resolve();
    });
  });
}
