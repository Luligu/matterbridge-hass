# Matterbridge Agents Instructions (v.1.0.12)

## Git — HARD RULES (non-negotiable)

- Read-only Git commands are always allowed: status, diff, log, show, blame, and branch/tag listing. Fetch is also allowed, although it updates remote-tracking refs; do not use options that delete refs, such as --prune.
- NEVER rewrite existing history: no rebase, amend, force-push, reset --hard, filter-branch, or reflog edits. These actions are prohibited even under the authorization procedure below.
- NEVER delete branches or tags (no branch -D, branch -d, push --delete, or tag -d).
- Staging changes, making local commits, pushing, and creating new branches are allowed ONLY when I ask for them AND authorize the exact command using the procedure below. My initial request is not authorization.
- Except for the explicitly allowed commands above, every Git command that changes the working tree, index, refs, or history requires authorization using the same procedure. This includes pull, merge, checkout/switch, restore, clean, cherry-pick, revert, tag creation, and stash operations.
- NEVER run a destructive or irreversible Git command without authorization. Actions explicitly prohibited above remain prohibited.

### Authorization procedure

1. Show the exact command in a bash code block. Specify the repository and branch, plus the affected files and full commit message where applicable.
2. Ask exactly: **"Do you authorize me to run this command to <action> in `<repo>` (`<branch>`)?"**
3. End your turn and wait.
4. Run the command only after an explicit affirmative answer to that question (e.g. "yes", "ok", "go", "authorized"). A question, change request, silence, or the original task request is NOT authorization.
5. Authorization covers only that exact command, that repository, and one execution. Run it exactly as shown. Any changed command or retry after a failure requires new authorization.

Without authorization, or when in doubt about whether authorization is required, do nothing: show the command and ask. Never work around missing authorization with an equivalent command, script, alias, or tool.

## Style And Formatting

- Follow [STYLEGUIDE.md](./STYLEGUIDE.md) for code style, naming, JSDoc, validation, logging, and formatting expectations.
- JSDoc requirements are enforced by the configured linter. Treat missing or incomplete JSDoc on required APIs as a real lint issue, not optional documentation.
- Import and export ordering are enforced by the formatter. Preserve the existing grouped and sorted order unless a change requires updating it.
- Formatting is enforced by oxfmt. Follow the existing formatting and do not fight the formatter.

## Scope And Safety

- Keep changes minimal and scoped to the request. Avoid unrelated refactors or broad cleanup.
- Do not modify production code only to make a test pass. If a failing test points to a likely source issue, explain the issue and change behavior only when required by the task.
- Preserve cross-platform behavior. Changes must work on Windows, macOS, and Linux, especially for paths, shell commands, environment variables, and networking behavior.
- Maintain compatibility with the supported Node.js versions in this repository: 22.13, 24 and 26.

## Context And Reading

- Read only the files the request needs. Start from the files the user names or the obvious entry point, and widen the search only when the task requires it.
- Prefer targeted searches (grep / glob) and partial reads (line ranges) over reading whole large files or scanning the whole repository.
- Do not read generated or vendored content unless the task is about it: `node_modules/`, `dist/`, `build/`, `coverage/`, `temp/`, lockfiles (`package-lock.json`, `bun.lock`), and `*.tsbuildinfo`.
- Read `.agents/rules/*` files and skills only when the task matches their topic, not up front.
- For a question or a small change, do not explore unrelated areas, run the full test suite, or summarize the project unasked.

## Project Architecture

- This repository uses TypeScript and ESM. Follow existing project patterns for imports, exports, build configuration, and test setup.

## Testing And Validation

- HARD RULE: never invoke `tsc`, `vitest`, `bun test`, `oxlint`, or `oxfmt` directly (via `npx`, `node node_modules/...`, or any other ad hoc form). Always use the matching entry in [package.json](./package.json) `scripts` or [tasks.json](./.vscode/tasks.json) — e.g. `npm run typecheck` (not `npx tsc`), `npm run lint` (not `npx oxlint`; `npm run lint:fix` rewrites files, so run it only when the user asks), `npm run format`/`npm run format:check` (not `npx oxfmt`), `npm run test`/`npm run test:coverage` or a specific `Test: <Area>` task (not `npx vitest`/`node node_modules/vitest/vitest.mjs` typed out by hand), `npm run test:bun` (not `bun test`). If a touched area has no matching script or task, say so and ask before improvising a raw invocation — do not silently fall back to `npx`.
- Keep tests deterministic and simple. Prefer small data sets and straightforward setup.
- Some tests are intentionally multi-step flows. State may persist across successive steps within a single test flow, but each test unit must remain isolated from other tests.
- For validation, run the relevant full test file or the matching suite/task for the touched area rather than assuming arbitrary isolated single-test execution is reliable.

## Documentation

- When behavior changes, update the relevant tests and documentation.

## Git Commits

- Do not manually add a `Signed-off-by:` trailer to commit messages. VS Code’s Git interface adds it through `git.alwaysSignOff`; when committing through a terminal, always use `git commit -s`.
- Never write a personal email address or any sensitive data into commit messages, trailers, or any generated text.

## Additional Agent Guidance

Before doing anything in this repo, read `~/.agents/AGENTS.md` and apply it.

For task-specific guidance, read relevant files in [.agents/rules](./.agents/rules/):

- `.agents/rules/testing.instructions.md` for testing and validation expectations;
- `.agents/rules/matterbridge.instructions.md` for guidance on creating and registering Matterbridge endpoints in a plugin;
- `.agents/rules/plugin-frontend.instructions.md` for guidance on plugin frontend SPAs and custom REST APIs;
- `.agents/rules/chip-tests.instructions.md` for guidance on the CHIP conformance test harness.

The following workflows are available as skills in [.agents/skills](./.agents/skills/), discovered automatically and invocable with `$<name>` (Codex), `@<name>` (Bionic / LM Studio) or `/<name>` (Claude Code, Copilot, Gemini / Antigravity):

- `$verify-agent-context` for verifying which coding agent is running and that it loaded the shared instructions, rules and skills from AGENTS.md and `.agents/`.
