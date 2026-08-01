/**
 * run-chip-tests.mjs
 * Version: 1.5.0
 *
 * Manage the `luligu/matterbridge:chip-test` docker container for the plugin in the current working
 * directory and run the Matter CHIP test suite defined in chipTests.json, logging full results to
 * chipTests.log and just the pass/fail summary to chipTestsSummary.log. Not specific to any one plugin:
 * drop a chipTests.json into any plugin repo and this script picks up its name, config, and tests from it.
 *
 * chipTests.json shape:
 *   "config"              (required) The plugin's config.json content, written into the container as
 *                          /root/.matterbridge/<config.name>.config.json before the container is restarted
 *                          in --start. "config.name" is also used as the plugin (npm package) name for the
 *                          container's volume mount and `matterbridge --add`.
 *   "resetClusterGlobs"   (optional) Filename globs (matched against files under this plugin's node
 *                          storage directory for the bridged endpoints) cleared by a "resetBefore": true or
 *                          "resetAfter": true test entry — see below. Defaults to an empty array; a test
 *                          entry using either flag with nothing configured here fails loudly instead of
 *                          silently doing nothing. Only needs entries for cluster state that's actually
 *                          persisted to disk (e.g. CameraAvStreamManagement's allocated streams, Chime
 *                          state) — the container restart that "resetBefore"/"resetAfter" also performs
 *                          already clears any cluster state kept purely in memory (e.g. WebRTC Transport
 *                          Provider's CurrentSessions), with no glob needed for that.
 *   "yamlTests"            (optional) The list of YAML certification tests (run through chip-tool's
 *                          websocket test runner, scripts/tests/chipyaml/chiptool.py) to run — see below.
 *                          chip-tool's own persistent storage inside the image already holds a fabric paired
 *                          with the matterbridge instance, so each invocation just spawns a short-lived
 *                          `chip-tool interactive server`, runs the one test, and tears it down again — no
 *                          separate commissioning step needed. Defaults to an empty array.
 *   "phytonTests"          (optional) The list of Python (src/python_testing/*.py) tests to run — see
 *                          below. Defaults to an empty array.
 * Each yamlTests/phytonTests entry may set an "input" string, piped to the test's stdin, for tests that
 * prompt for interactive confirmation (for example "y\ny\n").
 *
 * Usage:
 *   node scripts/run-chip-tests.mjs --start          Create the chip-test container and add/enable the plugin inside it.
 *   node scripts/run-chip-tests.mjs --stop           Stop the chip-test container, then reinstall, relink, and rebuild the local matterbridge instance.
 *   node scripts/run-chip-tests.mjs                  Run the tests listed in chipTests.json inside the running container.
 *   node scripts/run-chip-tests.mjs --test NAME       Run only the tests whose "name" or "test" property includes NAME (case-insensitive).
 *
 * A chipTests.json entry may set "resetBefore": true to clear persisted stateful cluster storage (matched
 * via "resetClusterGlobs", above) and restart the matterbridge process before that test runs, and/or
 * "resetAfter": true to do the same after that test runs (before the next one starts) — without recreating
 * the container (no docker rm/pull/npm install/build). This is much cheaper than --start.
 * "resetBefore" is for tests that depend on starting from a clean, un-allocated device state; "resetAfter"
 * is for tests that leave dirty residue (e.g. an unclosed session, a mutated attribute) that would otherwise
 * leak into whichever test runs next — put it on the test that causes the residue, not the one affected by
 * it, so the fix travels with the test that needs it even if the surrounding list is reordered.
 * Each yamlTests/phytonTests entry may also set a "comment" string, printed under a failing/skipped result
 * in the summary log, and a "skip": true flag to leave the test listed (documenting that it exists and why
 * it doesn't run) without ever invoking it — for tests that can never pass against this image (e.g. ones
 * requiring the CSA reference app's --app-pipe debug hook, which Matterbridge doesn't implement).
 */

/* eslint-disable no-console */

import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const containerName = 'chip-test';
const image = 'luligu/matterbridge:chip-test';
const testsFile = resolve(root, 'chipTests.json');
const logFile = resolve(root, 'chipTests.log');
const summaryLogFile = resolve(root, 'chipTestsSummary.log');
// Node storage for the bridged endpoints; only stateful cluster attributes that get written during a
// test create a file here, so these globs only ever remove test-mutated state, never device identity.
const matterstorageRoot = '/root/.matterbridge/matterstorage/Matterbridge';
const isWindows = process.platform === 'win32';
// On Windows npm is a .cmd shim, not a PE executable: spawnSync can't CreateProcess it directly
// (ENOENT/EINVAL even when resolved to npm.cmd), so it must be run through the shell.
const npmCommand = 'npm';

// Populated by loadChipTestsFile(), called first thing in main(): pluginName comes from chipTests.json's
// "config.name" rather than being hardcoded, so the container's plugin folder, --add, and config file all
// stay in sync with whatever config.json this repo's chipTests.json declares.
let pluginName;
let readyLogMarker;
let pluginConfig;
let resetClusterGlobs;
let allTests;

class ExitError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

function fail(message, code = 1) {
  throw new ExitError(message, code);
}

function run(command, args, options = {}) {
  const { capture = false, shell = false } = options;
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    windowsHide: true,
    shell,
  });

  if (result.error) {
    fail(`Failed to run "${command} ${args.join(' ')}": ${result.error.message}`);
  }

  return result;
}

function runOrFail(command, args, options) {
  const result = run(command, args, options);
  if (result.status !== 0) {
    fail(`Command failed (exit ${result.status}): ${command} ${args.join(' ')}`);
  }
  return result;
}

// Safe for the plain alphanumeric/path-like tokens this script passes to npm; quotes anything else for cmd.exe.
function quoteShellArg(arg) {
  if (/^[A-Za-z0-9_.\-:/=]+$/.test(arg)) {
    return arg;
  }
  return `"${arg.replace(/"/g, '""')}"`;
}

function runNpm(args, options) {
  if (!isWindows) {
    return run(npmCommand, args, options);
  }

  // Node deprecates passing an args array together with shell: true (DEP0190) because the
  // arguments are not escaped; fold the already-quoted command line into a single string instead.
  const commandLine = [npmCommand, ...args].map(quoteShellArg).join(' ');
  return run(commandLine, [], { ...options, shell: true });
}

function runNpmOrFail(args, options) {
  const result = runNpm(args, options);
  if (result.status !== 0) {
    fail(`Command failed (exit ${result.status}): npm ${args.join(' ')}`);
  }
  return result;
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function start() {
  console.log('Removing any existing chip-test container...');
  run('docker', ['rm', containerName, '-f']);

  console.log(`Pulling ${image}...`);
  runOrFail('docker', ['pull', image]);

  // The container needs an IPv6 link-local address (e.g. chip-tool's own traffic to fe80::.../UDP:5540), so
  // a plain IPv4-only network breaks it — create it with --ipv6 if a fresh host doesn't already have it.
  if (run('docker', ['network', 'inspect', 'matterbridge'], { capture: true }).status !== 0) {
    console.log('Creating the matterbridge docker network...');
    runOrFail('docker', ['network', 'create', '--ipv6', 'matterbridge']);
  }

  console.log('Starting the chip-test container...');
  runOrFail('docker', [
    'run',
    '-dit',
    '--network',
    'matterbridge',
    '--restart',
    'always',
    '--stop-timeout',
    '60',
    '--name',
    containerName,
    '-p',
    '8585:8283',
    '-v',
    `${join(root, 'temp')}:/tmp/matter_testing/logs`,
    '-v',
    `${root}:/root/Matterbridge/${pluginName}`,
    // Shadows just the node_modules subpath of the bind mount above with a named volume backed by the
    // container's own native (Linux) filesystem, persisted across container recreations (docker rm doesn't
    // remove named volumes). Matterbridge core re-links itself into a local plugin's node_modules on every
    // restart when it isn't already present there (see the comment below); running that npm operation, and
    // the container's own module resolution generally, against the host's Windows bind mount over Docker
    // Desktop's cross-OS file sharing is dramatically slower than native disk I/O, and a Windows-created
    // symlink for node_modules/matterbridge doesn't reliably resolve from inside the Linux container anyway.
    // With this volume, the container has its own independent node_modules entirely: the first `--start` ever
    // populates it (a real one-time cost, comparable to a fresh `npm install`), and every one after that finds
    // node_modules/matterbridge already present and skips straight past the re-link. The host's own
    // node_modules (used for building dist/, linting, tests, etc.) is never touched by any of this.
    '-v',
    `chip-test-node-modules:/root/Matterbridge/${pluginName}/node_modules`,
    image,
  ]);

  console.log('Installing dependencies and building the plugin...');
  runNpmOrFail(['install', '--no-fund', '--no-audit', '--verbose']);
  runNpmOrFail(['link', 'matterbridge', '--no-fund', '--no-audit', '--verbose']);
  runNpmOrFail(['run', 'build']);
  runNpmOrFail(['unlink', 'matterbridge', '--no-fund', '--no-audit']);

  console.log('Adding the plugin to the container...');
  runOrFail('docker', ['exec', containerName, 'matterbridge', '--add', pluginName]);

  writePluginConfig();

  console.log('Restarting the container...');
  const restartedAt = new Date().toISOString();
  runOrFail('docker', ['restart', containerName]);
  waitForContainerReady(restartedAt);
  console.log('Chip-test container ready.');
}

function stop() {
  console.log('Stopping the chip-test container...');
  run('docker', ['stop', containerName]);

  console.log('Restoring devDependencies and relinking the local matterbridge instance...');
  runNpmOrFail(['install', '--no-fund', '--no-audit', '--verbose']);
  runNpmOrFail(['link', 'matterbridge', '--no-fund', '--no-audit', '--verbose']);
  runNpmOrFail(['run', 'build']);

  console.log('Chip-test container stopped.');
}

// Waits for matterbridge to finish re-commissioning its server node after a restart by polling the
// container logs (only lines emitted since `sinceIso`) for readyLogMarker, so the next test doesn't race a
// not-yet-ready device. `docker logs` is cumulative for the container's whole lifetime, so without a
// `--since` anchor a second/subsequent restart would immediately re-match the marker line left over from
// an earlier boot still sitting in the tail window, returning a false "ready" before the new boot actually
// gets there.
function waitForContainerReady(sinceIso, timeoutMs = 45000, pollMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = run('docker', ['logs', '--since', sinceIso, containerName], { capture: true });
    // Matterbridge colorizes its log output with ANSI escapes even without a TTY, splitting the marker
    // text across escape sequences (e.g. "Matterbridge " <esc> "is online"); strip them before matching.
    // eslint-disable-next-line no-control-regex
    const plainOutput = `${result.stdout ?? ''}${result.stderr ?? ''}`.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
    if (plainOutput.includes(readyLogMarker)) {
      return;
    }
    sleepSync(pollMs);
  }
  console.warn(`Timed out waiting for "${readyLogMarker}" in container logs; continuing anyway.`);
}

// Clears persisted stateful cluster storage and restarts the container (docker restart, not a full
// recreate: no docker rm/pull/npm install/build), so tests that need a clean, un-allocated device state can
// run fast without paying the full --start cost between every test. The container restart alone already
// clears any cluster state that's kept purely in memory and never written to disk (e.g. WebRTC Transport
// Provider's CurrentSessions) — resetClusterGlobs only needs entries for state that *is* persisted (e.g.
// CameraAvStreamManagement's allocated streams, Chime state) and would otherwise survive the restart.
function resetContainerState() {
  if (resetClusterGlobs.length === 0) {
    fail(`A test set "resetBefore": true or "resetAfter": true, but ${testsFile} has no (or an empty) "resetClusterGlobs" array to clear.`);
  }

  console.log('Resetting stateful cluster storage...');
  const findExpr = resetClusterGlobs.map((glob) => `-name '${glob}'`).join(' -o ');
  run('docker', ['exec', containerName, 'sh', '-c', `find ${matterstorageRoot} -type f \\( ${findExpr} \\) -delete`]);

  console.log('Restarting matterbridge...');
  const restartedAt = new Date().toISOString();
  runOrFail('docker', ['restart', containerName]);
  waitForContainerReady(restartedAt);
}

// Reads chipTests.json once, populating pluginName/readyLogMarker/pluginConfig/allTests. Must run before
// anything that references those, so it's the first thing main() does.
function loadChipTestsFile() {
  let raw;
  try {
    raw = readFileSync(testsFile, 'utf8');
  } catch (error) {
    fail(`Unable to read ${testsFile}: ${error.message}`);
    return;
  }

  const parsed = JSON.parse(raw);

  pluginConfig = parsed.config;
  if (!pluginConfig || !pluginConfig.name) {
    fail(`Expected a "config" object with a "name" property in ${testsFile}`);
  }
  pluginName = pluginConfig.name;
  // Printed once the plugin has finished (re)configuring its devices after a restart; polled from `docker
  // logs`. The node coming online happens well before this and is not sufficient: on an already-commissioned
  // restart the node skips straight to "online", but the plugin (and its cluster state) isn't ready for
  // another ~30s after that, so waiting on the node-online line alone lets tests race a half-configured plugin.
  readyLogMarker = `Platform ${pluginName} configured successfully`;

  resetClusterGlobs = parsed.resetClusterGlobs ?? [];
  if (!Array.isArray(resetClusterGlobs)) {
    fail(`Expected "resetClusterGlobs" to be an array in ${testsFile}`);
  }

  const yamlTests = parsed.yamlTests ?? [];
  if (!Array.isArray(yamlTests)) {
    fail(`Expected "yamlTests" to be an array in ${testsFile}`);
  }
  const phytonTests = parsed.phytonTests ?? [];
  if (!Array.isArray(phytonTests)) {
    fail(`Expected "phytonTests" to be an array in ${testsFile}`);
  }

  allTests = [...yamlTests.map((test) => ({ ...test, kind: 'yaml' })), ...phytonTests.map((test) => ({ ...test, kind: 'python' }))];
  for (const test of allTests) {
    if (!test.test) {
      fail(`Missing "test" name for entry ${JSON.stringify(test)} in ${testsFile}`);
    }
  }
}

// Writes chipTests.json's "config" object into the container's Matterbridge storage directory, so the
// plugin starts with a known configuration instead of whatever defaults `matterbridge --add` would create.
function writePluginConfig() {
  console.log('Writing the plugin config into the container...');
  const result = spawnSync('docker', ['exec', '-i', containerName, 'sh', '-c', `cat > /root/.matterbridge/${pluginName}.config.json`], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    input: `${JSON.stringify(pluginConfig, null, 2)}\n`,
  });
  if (result.status !== 0) {
    fail(`Failed to write the plugin config into the container (exit ${result.status}): ${result.stderr ?? ''}`);
  }
}

function buildArgs(test) {
  const scriptArgs = [];
  for (const entry of test.args ?? []) {
    scriptArgs.push(...entry.split(/\s+/).filter(Boolean));
  }
  return scriptArgs;
}

// Builds the argv (after "docker exec -i containerName") for a single test, dispatching on test.kind:
//   - "python": python3 src/python_testing/<test.test> <args...>
//   - "yaml":   python3 scripts/tests/chipyaml/chiptool.py tests <test.test> <args...>
//               Spawns a short-lived "chip-tool interactive server" for the duration of this one test,
//               reusing chip-tool's own persisted fabric pairing baked into the image.
function buildExecArgs(test) {
  const args = buildArgs(test);
  if (test.kind === 'yaml') {
    return ['python3', 'scripts/tests/chipyaml/chiptool.py', 'tests', test.test, ...args];
  }
  return ['python3', `src/python_testing/${test.test}`, ...args];
}

function filterTests(tests, nameFilter) {
  if (!nameFilter) {
    return tests;
  }

  const needle = nameFilter.toLowerCase();
  const filtered = tests.filter((test) => test.name.toLowerCase().includes(needle) || test.test.toLowerCase().includes(needle));
  if (filtered.length === 0) {
    fail(`No test found with "name" or "test" including ${JSON.stringify(nameFilter)}`);
  }
  return filtered;
}

function runTests(nameFilter) {
  const tests = filterTests(allTests, nameFilter);
  const startedAt = `Chip tests run started at ${new Date().toISOString()}\n\n`;
  writeFileSync(logFile, startedAt);

  const results = [];
  for (const test of tests) {
    const label = `${test.name} (${test.test})`;

    if (test.skip) {
      console.log(`SKIP: ${label}`);
      appendFileSync(logFile, `=== ${label} ===\nSkipped ("skip": true set in ${testsFile})\n\n`);
      results.push({ label, passed: false, skipped: true, comment: test.comment });
      continue;
    }

    const execArgs = buildExecArgs(test);
    const commandLine = execArgs.join(' ');

    if (test.resetBefore) {
      appendFileSync(logFile, `--- reset stateful cluster storage before ${label} ---\n`);
      resetContainerState();
    }

    console.log(`Running: ${label}`);
    appendFileSync(logFile, `=== ${label} ===\n${commandLine}\n`);

    const result = spawnSync('docker', ['exec', '-i', containerName, ...execArgs], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      input: test.input ?? '',
    });

    appendFileSync(logFile, `${result.stdout ?? ''}${result.stderr ?? ''}\n`);

    const passed = result.status === 0;
    appendFileSync(logFile, `Result: ${passed ? 'PASS' : 'FAIL'} (exit ${result.status})\n\n`);
    console.log(passed ? `PASS: ${label}` : `FAIL: ${label} (exit ${result.status})`);

    results.push({ label, passed, comment: test.comment });

    if (test.resetAfter) {
      appendFileSync(logFile, `--- reset stateful cluster storage after ${label} ---\n`);
      resetContainerState();
    }
  }

  const executedResults = results.filter((result) => !result.skipped);
  const skippedCount = results.length - executedResults.length;
  const passedCount = executedResults.filter((result) => result.passed).length;
  const resultLines = results.flatMap((result) => {
    const icon = result.skipped ? '⏭️' : result.passed ? '✅' : '❌';
    const line = `${icon} ${result.label}`;
    return (result.skipped || !result.passed) && result.comment ? [line, `   ↳ ${result.comment}`] : [line];
  });
  const summary = `Summary: ${passedCount}/${executedResults.length} tests passed${skippedCount ? ` (${skippedCount} skipped)` : ''}.`;

  appendFileSync(logFile, `${resultLines.join('\n')}\n\n${summary}\n`);
  writeFileSync(summaryLogFile, `${startedAt}${resultLines.join('\n')}\n\n${summary}\n`);
  console.log(resultLines.join('\n'));
  console.log(summary);

  const unexpectedFailures = executedResults.filter((result) => !result.passed && !result.comment);
  if (unexpectedFailures.length > 0) {
    process.exitCode = 1;
  }
}

function main() {
  const args = process.argv.slice(2);
  loadChipTestsFile();

  if (args.includes('--start')) {
    start();
    return;
  }

  if (args.includes('--stop')) {
    stop();
    return;
  }

  const testFlagIndex = args.indexOf('--test');
  if (testFlagIndex === -1) {
    runTests();
    return;
  }

  const nameFilter = args[testFlagIndex + 1];
  if (!nameFilter) {
    fail('--test requires a NAME argument');
  }
  runTests(nameFilter);
}

try {
  main();
} catch (error) {
  if (error instanceof ExitError) {
    if (error.message) console.error(error.message);
    process.exitCode = error.code;
  } else {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
