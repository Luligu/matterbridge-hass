## Shared agent instructions for Matterbridge plugins

This repository supplies shared guidance through [AGENTS.md](./AGENTS.md) and [.agents/](./.agents/), the **single source of truth** for agent instructions, rules, and skills. Edit the shared guidance there; the instruction and skill wrappers under `.github/` and `.claude/` point back to it. Those folders also contain other configuration, workflows, and metadata; `.codex/` and `.antigravity/` contain tool-specific configuration. See [.agents/README.md](./.agents/README.md) for the full layout.

| File                                            | Notes                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`                                     | Main project instructions — shared by every agent                                                            |
| `.agents/README.md`                             | Layout and versioning of the shared instructions                                                             |
| `.agents/rules/testing.instructions.md`         | Testing standards for unit tests                                                                             |
| `.agents/rules/matterbridge.instructions.md`    | Create and register Matterbridge endpoints and use exported device classes                                   |
| `.agents/rules/plugin-frontend.instructions.md` | Serve plugin frontend SPAs and custom REST APIs, including Home Assistant Ingress paths                      |
| `.agents/rules/chip-tests.instructions.md`      | Configure and run the CHIP conformance test harness                                                          |
| `.agents/skills/verify-agent-context/SKILL.md`  | Verify the agent loaded this context — `$verify-agent-context` (Codex), `/verify-agent-context` (all others) |

Shared rules and skills live in `.agents/`; the main instructions live in `AGENTS.md`, which also references `STYLEGUIDE.md`. The template supplies wrappers for Claude Code and Copilot and direct entry points for Codex and Gemini / Antigravity. Loading depends on the client and its configuration; the table describes the repository setup.

| Tool                               | Instructions                                    | Rules                                                 | Skills                                              |
| ---------------------------------- | ----------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------- |
| Codex                              | `AGENTS.md` — read natively                     | `.agents/rules/` — linked from `AGENTS.md`, on demand | `.agents/skills/` — native, `$verify-agent-context` |
| Copilot (VS Code and coding agent) | `.github/copilot-instructions.md` → `AGENTS.md` | stubs in `.github/instructions/` — `applyTo` globs    | stub in `.github/skills/` — `/verify-agent-context` |
| Claude Code                        | `CLAUDE.md` imports `AGENTS.md`                 | stubs in `.claude/rules/` — `paths` globs             | stub in `.claude/skills/` — `/verify-agent-context` |
| Gemini / Antigravity               | `GEMINI.md` imports `AGENTS.md`                 | `.agents/rules/` — on demand                          | `.agents/skills/` — native, `/verify-agent-context` |

Repository-local additions in `localAgents.md`, when present, are appended to `AGENTS.md` during upgrade. The other entry points reach them through `AGENTS.md`. Files managed by mb-run are refreshed from its templates on upgrade.

The plugin guidance covers endpoints, frontend SPAs and REST APIs, and CHIP conformance tests. These rules are included even when the frontend or CHIP features are not enabled. The CHIP workflow itself is copied only when `automator.chip` is true.

### Copilot instructions

| File                                                                   | Notes                                                                                                 |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `.github/copilot-instructions.md`                                      | Entry point importing or linking to AGENTS.md                                                         |
| `.github/instructions/testing/testing.instructions.md`                 | Testing standards — scoped to the test patterns listed below                                          |
| `.github/instructions/matterbridge/matterbridge.instructions.md`       | Endpoint guide — scoped to `src/module.ts`                                                            |
| `.github/instructions/plugin-frontend/plugin-frontend.instructions.md` | Frontend guide — scoped to `apps/frontend/**` and `src/*.ts`                                          |
| `.github/instructions/chip-tests/chip-tests.instructions.md`           | CHIP harness guide — scoped to the CHIP files listed below                                            |
| `.github/agents/matterbridge.agent.md`                                 | **Matterbridge** custom agent — follows the shared instructions and works without subagent delegation |
| `.github/skills/verify-agent-context/SKILL.md`                         | Skill invocable as `/verify-agent-context`                                                            |

The testing pointers for both Claude Code and Copilot cover `**/*.test.ts`, `**/*.spec.ts`, `**/test/**/*.ts`, `**/vitest/**/*.ts`, and `**/buntest/**/*.ts`.

### Claude instructions

| File                                                            | Notes                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------ |
| `CLAUDE.md`                                                     | Entry point importing or linking to AGENTS.md                |
| `.claude/settings.json`                                         | Claude permissions: allow, ask and deny rules                |
| `.claude/rules/testing/testing.instructions.md`                 | Testing standards — scoped to the test patterns listed below |
| `.claude/rules/matterbridge/matterbridge.instructions.md`       | Endpoint guide — scoped to `src/module.ts`                   |
| `.claude/rules/plugin-frontend/plugin-frontend.instructions.md` | Frontend guide — scoped to `apps/frontend/**` and `src/*.ts` |
| `.claude/rules/chip-tests/chip-tests.instructions.md`           | CHIP harness guide — scoped to the CHIP files listed below   |
| `.claude/skills/verify-agent-context/SKILL.md`                  | Skill invocable as `/verify-agent-context`                   |

The CHIP pointers for both Claude Code and Copilot cover `chipTests.json`, `chipTests.md`, `chipTests.log`, `chipTestsSummary.log`, `scripts/run-chip-tests.mjs`, and `.github/workflows/chip-tests.yml`.

### Codex instructions

| File                         | Notes                                                             |
| ---------------------------- | ----------------------------------------------------------------- |
| `AGENTS.md`                  | Main project instructions — read directly, no pointer file needed |
| `.codex/config.toml`         | Codex project permissions, approvals, and profiles                |
| `.codex/rules/default.rules` | Codex command allow, prompt, and deny rules                       |

Codex discovers skills in `.agents/skills/`; the skill is invoked as `$verify-agent-context`. Rules in `.agents/rules/` are referenced by `AGENTS.md` and read when relevant; they are not automatically applied by glob. For plugins, this includes `matterbridge.instructions.md`, `plugin-frontend.instructions.md`, and `chip-tests.instructions.md` alongside `testing.instructions.md`.

### Gemini / Antigravity instructions

| File                         | Notes                                                 |
| ---------------------------- | ----------------------------------------------------- |
| `GEMINI.md`                  | Entry point importing or linking to AGENTS.md         |
| `.antigravity/settings.json` | Sandboxing and permissions: allow, ask and deny rules |

The shared testing, Matterbridge endpoint, plugin frontend, and CHIP harness rules under `.agents/rules/` apply on demand for the relevant tasks, and `.agents/skills/` is discovered automatically as `/verify-agent-context`.
