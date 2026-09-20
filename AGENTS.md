# Matterbridge Agents Instructions (v.1.0.3)

## Style And Formatting

- Follow [STYLEGUIDE.md](./STYLEGUIDE.md) for code style, naming, JSDoc, validation, logging, and formatting expectations.
- JSDoc requirements are enforced by the linter. Treat missing or incomplete JSDoc on required APIs as a real lint issue, not optional documentation.
- Import and export ordering are enforced by the linter or by the formatter. Preserve the existing grouped and sorted order unless a change requires updating it.
- Follow the existing formatting and do not fight the formatter.

## Scope And Safety

- Keep changes minimal and scoped to the request. Avoid unrelated refactors or broad cleanup.
- Do not modify production code only to make a test pass. If a failing test points to a likely source issue, explain the issue and change behavior only when required by the task.
- Preserve cross-platform behavior. Changes must work on Windows, macOS, and Linux, especially for paths, shell commands, environment variables, and networking behavior.
- Maintain compatibility with the supported Node.js versions in this repository: 20.19, 22.13, 24 and 26.

## Project Architecture

- This repository is a TypeScript ESM repo. Follow existing project patterns for imports, exports, build configuration, and test setup.

## Testing And Validation

- HARD RULE: never invoke `tsc`, `vitest`, `oxlint`, or `oxfmt` directly (via `npx`, `node node_modules/...`, or any other ad hoc form). Always use the matching entry in [package.json](./package.json) `scripts` or [tasks.json](./.vscode/tasks.json) — e.g. `npm run typecheck` (not `npx tsc`), `npm run lint`/`npm run lint:fix` (not `npx oxlint`), `npm run format`/`npm run format:check` (not `npx oxfmt`), `npm run test`/`npm run test:coverage` or a specific `Test: <Area>` task (not `npx vitest`/`node node_modules/vitest/vitest.mjs` typed out by hand). If a touched area has no matching script or task, say so and ask before improvising a raw invocation — do not silently fall back to `npx`.
- Keep tests deterministic and simple. Prefer small data sets and straightforward setup.
- Some tests are intentionally multi-step flows. State may persist across successive steps within a single test flow, but each test unit must remain isolated from other tests.
- For validation, run the relevant full test file or the matching suite/task for the touched area rather than assuming arbitrary isolated single-test execution is reliable.

## Documentation

- When behavior changes, update the relevant tests and documentation in the README.md files.

## Additional Agent Guidance

For task-specific guidance, read relevant files in [.agents/rules](./.agents/rules/):

- `.agents/rules/testing.instructions.md` for testing and validation expectations;
- `.agents/rules/matterbridge.instructions.md` for instruction about using matterbridge in a plugin;
- `.agents/rules/plugin-frontend.instructions.md` for guidance on plugin frontend SPAs and custom REST APIs;
- `.agents/rules/chip-tests.instructions.md` for guidance on the CHIP conformance test harness.

The following workflows are available as skills in [.agents/skills](./.agents/skills/), discovered automatically and invocable with `$<name>` (Codex) or `/<name>` (Claude Code, Copilot, Gemini / Antigravity):

- `$verify-agent-context` for verifying which coding agent is running and that it loaded the shared instructions, rules and skills from AGENTS.md and `.agents/`.
