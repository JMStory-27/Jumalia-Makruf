---
name: JIKAN upstream fragility (504 from MyAnimeList)
description: JIKAN v4 returns 504 ⇢ MyAnimeList backend outage; warm-cache and page-level calls need partial-result tolerance.
---

When JIKAN v4 returns `504 {"type":"BadResponseException","message":"Jikan failed to connect to MyAnimeList. MyAnimeList may be down/unavailable..."}`, the failure is **upstream** (MAL itself), not us. Direct curl from shell returns the same 504 under 1 second. Rate-limit retries do not help during this state.

**Why:** A "warm all 4 future seasons at startup" approach ran through this state — 50 anime successfully cached for summer_2026, but fall_2026/winter_2027/spring_2027 each failed on page=1 with 504. Anisub `/seasons` therefore showed 1 full block + 3 empty blocks with a `JIKAN 504` error string instead of lineup data.

**How to apply:**
- Per-page try/catch in `fetchJikanSeason` so a mid-pagination 504 keeps partial results instead of failing the whole lineup (page 1–2 success then page N timeout → cache pages 1–(N-1), warn).
- Cache `{}` (empty) results only on full failure; do not poison TTL with empty array — keep reading from disk on subsequent restarts.
- Front-end should show a non-alarming placeholder when `season.error` is a 504 ("lineup sementara tidak tersedia dari MAL — coba lagi nanti") rather than a hard "0 judul lineup" count, since upstream is the cause and counts may recover on the next 6 h refresh.
- Always probe JIKAN first when a season comes back empty; do not assume our queue / rate-limit gating is at fault.
