---
name: api-server port quirk (8080)
description: api-server binds to PORT env (8080 today, not 8000); any front-end Vite proxy must target that port.
---

`artifacts/api-server` starts with `node --enable-source-maps ./dist/index.mjs` and binds to `process.env.PORT`. Replit assigns each artifact its own PORT — in this workspace api-server binds **8080**, not the conventional 8000.

**Why:** Anisub's `vite.config.ts` originally proxied `/api → http://localhost:8000`. That gave 500s with 0-byte body on every JIKAN route while older `/api/otakudesu/*` calls "looked fine" (turned out anisub's runtime later reads the cache directly via different paths, masking the issue).

**How to apply:** When wiring a new front-end artifact to api-server, do not hard-code 8000 — read `dist/index.mjs` runtime log line `Server listening port: NNNN` (or query `/api/healthz`) and use that port in the Vite proxy target. Re-confirm on every workspace restore because Replit may reassign ports per session.
