## Default Preferences (Knowledge Commons / KC Works projects)

### Security & Secrets
- **Never read** `.env`, `.env.*`, `.invenio.private`, `docker/nginx_local/*` or any credential files unless explicitly directed in the current prompt
- When reading/writing these files: **always require explicit user confirmation via UI prompt**
- Never run `printenv`, unrestricted `env`, `docker compose config` - these can leak secrets

### Python Tooling
- Package management: **uv** (root `.venv`)
- Lint: `uv run ruff check`
- Typecheck: **ty** (not mypy)
- Tests: `./run-tests.sh` (local uses test-runner container for security)

### JavaScript Tooling  
- Package manager: **pnpm** (root project only, pinned in package.json)
- Install deps: `pnpm install`, build: `pnpm run build`
- Lint JS: `pnpm run lint`

### Code Style
- Python: PEP8, type hints required, Google-style docstrings with Markdown formatting
- JS/TS: ES2020, camelCase vars, PascalCase components, JSDoc for public APIs
- Imports sorted: stdlib → third-party → local (alphabetically within groups)
- 4-space indentation, single quotes for strings, trailing commas for multi-line

### Development Workflow
- **Approval before edits**: Explain the issue and proposed change first; wait for explicit yes
- Avoid speculative refactors; prefer smallest validated fix
- After mistakes: stop, acknowledge, offer revert - don't make more unapproved changes
