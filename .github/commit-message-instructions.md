# Commit Message Instructions (v.1.0.0)

Write the commit message following [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

- The first line MUST be `<type>(<optional scope>): <subject>`. Never write a subject without the type prefix.
- Type is one of `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Scope is optional: use the module or package name when the change is limited to one of them.
- Subject in imperative mood, lowercase, no trailing period, at most 72 characters.
- For a non-trivial change, add a blank line and a short body explaining what changed and why, wrapped at 100 characters.
- Mark breaking changes with `!` after the type or scope and a `BREAKING CHANGE:` footer.
- Do not add any other footer.

Examples:

```text
chore: add conventional commit instructions for commit message generation
fix(platform): log device discovery at debug level
refactor(utils): move shared helpers into a new module
```
