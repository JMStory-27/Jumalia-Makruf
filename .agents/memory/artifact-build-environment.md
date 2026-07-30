---
name: Artifact build environment
description: Non-obvious build and dependency behavior for restored managed web artifacts
---

Managed Vite artifacts receive `PORT` and `BASE_PATH` from their workflow. Direct production builds must provide those values explicitly, while the workflow itself supplies them automatically.

**Why:** The restored source can already declare all required packages while its per-package dependency links are stale or missing; a workspace install refreshes those links without changing application code.

**How to apply:** After restoring or importing artifact source, run the workspace package install before restarting managed workflows. For direct builds, use the artifact's assigned port and preview path as `PORT` and `BASE_PATH`.