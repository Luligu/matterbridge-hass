# Dev Containers v.2.2.0

Node and Bun configurations for Matterbridge plugins, aligned with Matterbridge’s Docker VMM setup. Open **Dev Containers: Reopen in Container** and select a runtime.

## Lifecycle scripts

- The lifecycle scripts ship inside the shared image in /usr/local/bin and are on PATH. The repository no longer carries post-create.sh, post-start.sh or install-matterbridge.sh: this directory holds only the two devcontainer.json files and this README.
- `postCreateCommand` runs `post-create.sh --node --plugin` or `post-create.sh --bun --plugin`, `postStartCommand` runs `post-start.sh --node --plugin` or `post-start.sh --bun --plugin`. The runtime flag is mandatory and `--plugin` selects the plugin lifecycle; the scripts exit with a usage message without a runtime.
- post-create.sh calls install-matterbridge.sh from the image and installs the dev branch by default. Append `--main` to `postCreateCommand` to install the stable branch instead, or `--dev` to state the default explicitly.
- Updating the scripts means pulling a newer image, not editing repository files. The unconditional pull in `initializeCommand` keeps the image fresh, but an existing container keeps the image it was created from: run **Dev Containers: Rebuild Container** to pick the new scripts up.

## Startup and storage

- The host bootstrap uses only Docker: network inspection/creation and an unconditional image pull run in parallel. No host Bash, Node or Bun installation is needed. Everything else runs inside the container.
- Repository source remains bind-mounted. Runtime-specific named volumes hold node_modules; a shared repository volume holds .cache.
- Both runtimes share the vscode-extensions volume, plus package caches, Bash history and agent state. The images seed home volume ownership with UID/GID 1000; workspace volume ownership is checked during creation.
- Creation prepares ownership and installs/builds Matterbridge from the dev branch into the shared runtime-specific /workspaces/matterbridge volume, then links it globally.
- Creation also installs plugin dependencies, links Matterbridge, builds the plugin and its optional apps/frontend, registers the plugin with Matterbridge, and checks for outdated packages.
- Each start installs plugin dependencies, links Matterbridge, and builds the plugin and its optional apps/frontend.
- Frontend dependencies and Matterbridge runtime state also use named volumes. Port 8283 exposes the Matterbridge frontend over IPv4 and IPv6.

## Docker VMM host setup

Use Virtual file shares (VirtioFS) for the repository parent directory. Avoid Synchronized file shares: the Matterbridge 2.1.0 reference documents Git memory-mapping failures with those shares.

On Windows with Docker VMM, set "dev.containers.forwardWSLServices": false in VS Code **user** settings to avoid unnecessary WSL probes. This application-level setting cannot be supplied by the container configuration.

After updating these files or the shared image, run **Dev Containers: Rebuild Container**. Pulling an image does not replace an existing container. Stop the previous runtime before switching: both variants share writable volumes and publish port 8283.
