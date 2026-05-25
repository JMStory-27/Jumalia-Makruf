'use client';
import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { fetchSchedule } from "@/lib/api";
import { usePoster } from "@/lib/usePoster";
import { titlePlaceholder } from "@/lib/utils";

const DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const DAY_SHORT: Record<string, string> = {
  Senin: "Sen", Selasa: "Sel", Rabu: "Rab", Kamis: "Kam",
  Jumat: "Jum", Sabtu: "Sab", Minggu: "Min",
};
const JS_TO_ID: Record<number, string> = {
  1: "Senin", 2: "Selasa", 3: "Rabu", 4: "Kamis", 5: "Jumat", 6: "Sabtu", 0: "Minggu",
};

const ACCENT_COLORS = [
  "#60A5FA", "#A78BFA", "#F472B6", "#34D399", "#FBBF24",
  "#22D3EE", "#FB923C", "#C084FC", "#4ADE80", "#F87171",
];

function getWeekDates() {
  const today = new Date();
  const todayName = JS_TO_ID[today.getDay()];
  const todayIdx = DAYS.indexOf(todayName);
  return DAYS.map((day, i) => {
    const diff = i - todayIdx;
    const d = new Date(today);
    d.setDate(today.getDate() + diff);
    return { day, date: d.getDate(), short: DAY_SHORT[day], isToday: day === todayName };
  });
}

/* ─── AniList weekly schedule (all pages) ─── */
interface AiringEntry {
  airingAt: number;
  media: { title: { romaji: string; english?: string; native?: string } };
}

async function fetchAiringWeek(): Promise<AiringEntry[]> {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const weekStart = Math.floor(monday.getTime() / 1000);
  const weekEnd = Math.floor(sunday.getTime() / 1000);

  const query = `
    query($start: Int, $end: Int, $page: Int) {
      Page(page: $page, perPage: 50) {
        pageInfo { hasNextPage }
        airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
          airingAt
          media { title { romaji english native } }
        }
      }
    }
  `;

  const all: AiringEntry[] = [];
  for (let page = 1; page <= 20; page++) {
    try {
      const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { start: weekStart, end: weekEnd, page } }),
        signal: AbortSignal.timeout(10_000),
      });
      const json = await res.json();
      const pageData = json.data?.Page;
      if (!pageData) break;
      all.push(...(pageData.airingSchedules ?? []));
      if (!pageData.pageInfo?.hasNextPage) break;
    } catch {
      break;
    }
  }
  return all;
}

/* ─── Fallback: search AniList by title → nextAiringEpisode ─── */
const fallbackCache = new Map<string, number | null>();

async function fetchAiringTimeByTitle(title: string): Promise<number | null> {
  const key = title.toLowerCase();
  if (fallbackCache.has(key)) return fallbackCache.get(key)!;
  try {
    const safe = title.replace(/"/g, "").replace(/[^\w\s:!?]/g, " ").trim();
    const q = `{
      Media(type: ANIME, search: "${safe}", status: RELEASING) {
        nextAiringEpisode { airingAt }
      }
    }`;
    const res = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: q }),
      signal: AbortSignal.timeout(8_000),
    });
    const json = await res.json();
    const t = json.data?.Media?.nextAiringEpisode?.airingAt ?? null;
    fallbackCache.set(key, t);
    return t;
  } catch {
    fallbackCache.set(key, null);
    return null;
  }
}

/* ─── Title matching ─── */
function normTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\bseason\s*\d+/g, "")
    .replace(/\bpart\s*\d+/g, "")
    .replace(/\bcour\s*\d+/g, "")
    .replace(/\bsub\s*indo\b/g, "")
    .replace(/\(end\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wordOverlap(a: string, b: string): number {
  const wa = new Set(a.split(" ").filter((w) => w.length > 2));
  const wb = new Set(b.split(" ").filter((w) => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  let common = 0;
  wa.forEach((w) => { if (wb.has(w)) common++; });
  return common / Math.max(wa.size, wb.size);
}

function buildTimeMap(entries: AiringEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    const titles = [e.media.title.romaji, e.media.title.english, e.media.title.native]
      .filter(Boolean) as string[];
    for (const t of titles) {
      const key = normTitle(t);
      if (key.length > 2) map.set(key, e.airingAt);
    }
  }
  return map;
}

function lookupTime(title: string, map: Map<string, number>): number | null {
  const norm = normTitle(title);
  if (map.has(norm)) return map.get(norm)!;
  let best: number | null = null;
  let bestScore = 0.40;
  for (const [key, ts] of map) {
    const score = wordOverlap(norm, key);
    if (score > bestScore) { bestScore = score; best = ts; }
  }
  return best;
}

function fmtWIB(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/* ─── Poster component ─── */
function SchedulePoster({ title, accent }: { title: string; accent: string }) {
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState(false);
  const malPoster = usePoster(title);
  const [grad, initials] = titlePlaceholder(title);

  return (
    <div
      className="relative flex-shrink-0 rounded-xl overflow-hidden"
      style={{ width: 58, height: 82, boxShadow: "0 4px 16px rgba(0,0,0,0.5)" }}
    >
      <div className="absolute inset-0 flex items-center justify-center" style={{ background: grad }}>
        <span style={{ fontSize: 20, fontWeight: 900, color: "rgba(255,255,255,0.3)" }}>{initials}</span>
      </div>
      {malPoster && !err && (
        <img
          src={malPoster} alt={title}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: loaded ? 1 : 0, transition: "opacity 0.4s ease" }}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setErr(true)}
        />
      )}
      <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full"
        style={{ background: accent, boxShadow: `0 0 6px ${accent}` }} />
    </div>
  );
}

/* ─── Hook: per-title fallback time ─── */
function useFallbackTimes(
  titles: string[],
  timeMap: Map<string, number>,
): Map<string, number> {
  const [extra, setExtra] = useState<Map<string, number>>(new Map());
  const fetchedRef = useRef<Set<string>>(new Set());

  const unmatched = useMemo(() =>
    titles.filter(t => !lookupTime(t, timeMap) && !fetchedRef.current.has(t.toLowerCase())),
    [titles, timeMap]
  );

  useMemo(() => {
    if (unmatched.length === 0) return;
    const DELAY = 400;
    unmatched.forEach((title, idx) => {
      const key = title.toLowerCase();
      fetchedRef.current.add(key);
      setTimeout(async () => {
        const t = await fetchAiringTimeByTitle(title);
        if (t) {
          setExtra(prev => {
            const next = new Map(prev);
            next.set(key, t);
            return next;
          });
        }
      }, idx * DELAY);
    });
  }, [unmatched]);

  return extra;
}

/* ─── Main page ─── */
export default function SchedulePage() {
  const [, setLocation] = useLocation();
  const todayName = JS_TO_ID[new Date().getDay()];
  const [activeDay, setActiveDay] = useState(todayName);
  const weekDates = getWeekDates();

  const { data: scheduleData, isLoading } = useQuery({
    queryKey: ["schedule"],
    queryFn: fetchSchedule,
    staleTime: 60 * 60_000,
  });

  const { data: airingData } = useQuery({
    queryKey: ["airing-week"],
    queryFn: fetchAiringWeek,
    staleTime: 60 * 60_000,
    retry: 1,
  });

  const timeMap = useMemo(
    () => (airingData ? buildTimeMap(airingData) : new Map<string, number>()),
    [airingData]
  );

  const scheduleList = scheduleData?.scheduleList ?? [];
  const todaySchedule = scheduleList.find((s) => s.title === activeDay);
  const rawAnimeList = todaySchedule?.animeList ?? [];
  const allTitles = rawAnimeList.map(a => a.title);

  const fallbackTimes = useFallbackTimes(allTitles, timeMap);

  const animeList = useMemo(() => {
    const items = rawAnimeList.map((a) => {
      const fromWeekly = lookupTime(a.title, timeMap);
      const fromFallback = fallbackTimes.get(a.title.toLowerCase()) ?? null;
      return { ...a, airTime: fromWeekly ?? fromFallback };
    });
    return items.sort((a, b) => {
      if (a.airTime && b.airTime) return a.airTime - b.airTime;
      if (a.airTime) return -1;
      if (b.airTime) return 1;
      return a.title.localeCompare(b.title);
    });
  }, [rawAnimeList, timeMap, fallbackTimes]);

  return (
    <div className="min-h-screen pb-28" style={{ background: "#07070e" }}>
      {/* Header */}
      <div
        className="sticky top-0 z-40 px-4 pt-4 pb-3"
        style={{
          background: "rgba(7,7,14,0.97)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1
              className="text-xl font-black tracking-tight"
              style={{
                background: "linear-gradient(135deg, #60A5FA, #A78BFA, #F472B6)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              📅 Jadwal Rilis
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
              Anime tayang minggu ini
            </p>
          </div>
          {animeList.length > 0 && (
            <span
              className="text-xs font-bold px-3 py-1.5 rounded-full"
              style={{
                background: "rgba(96,165,250,0.12)",
                color: "#60A5FA",
                border: "1px solid rgba(96,165,250,0.2)",
              }}
            >
              {animeList.length} anime
            </span>
          )}
        </div>

        {/* Day Picker */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {weekDates.map(({ day, date, short, isToday }) => {
            const isActive = day === activeDay;
            const dayCount = scheduleList.find(s => s.title === day)?.animeList.length ?? 0;
            return (
              <button
                key={day}
                onClick={() => setActiveDay(day)}
                className="flex-shrink-0 flex flex-col items-center justify-center rounded-2xl transition-all duration-200"
                style={{
                  minWidth: 52,
                  paddingTop: 10,
                  paddingBottom: 10,
                  background: isActive
                    ? "linear-gradient(135deg, #667eea, #764ba2)"
                    : isToday ? "rgba(167,139,250,0.1)" : "rgba(255,255,255,0.04)",
                  border: isToday && !isActive
                    ? "1px solid rgba(167,139,250,0.35)"
                    : isActive ? "1px solid transparent" : "1px solid rgba(255,255,255,0.06)",
                  boxShadow: isActive ? "0 4px 16px rgba(102,126,234,0.45)" : "none",
                  transform: isActive ? "scale(1.05)" : "scale(1)",
                }}
              >
                <span className="text-lg font-black leading-none"
                  style={{ color: isActive ? "#fff" : isToday ? "#A78BFA" : "#64748B" }}>
                  {date}
                </span>
                <span className="text-[10px] font-bold mt-0.5 tracking-wide"
                  style={{ color: isActive ? "rgba(255,255,255,0.8)" : isToday ? "#A78BFA" : "#475569" }}>
                  {short}
                </span>
                {dayCount > 0 && (
                  <span className="text-[9px] font-bold mt-0.5"
                    style={{ color: isActive ? "rgba(255,255,255,0.6)" : "#334155" }}>
                    {dayCount}
                  </span>
                )}
                {isToday && !isActive && (
                  <div className="w-1 h-1 rounded-full mt-0.5"
                    style={{ background: "#A78BFA", boxShadow: "0 0 4px #A78BFA" }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pt-4">
        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-3 p-3 rounded-2xl animate-pulse"
                style={{ background: "rgba(255,255,255,0.04)", height: 100 }} />
            ))}
          </div>
        )}

        {!isLoading && animeList.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <div className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.04)" }}>
              <span className="text-4xl">😴</span>
            </div>
            <p className="text-base font-bold" style={{ color: "#F1F5F9" }}>Tidak ada anime hari ini</p>
            <p className="text-sm" style={{ color: "#475569" }}>Coba pilih hari lain</p>
          </div>
        )}

        {!isLoading && animeList.length > 0 && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-4 rounded-full"
                style={{ background: "linear-gradient(180deg, #60A5FA, #A78BFA)" }} />
              <span className="text-xs font-bold tracking-wider uppercase" style={{ color: "#60A5FA" }}>
                {activeDay === todayName ? `Hari Ini · ${activeDay}` : activeDay}
              </span>
              {airingData && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                  style={{ background: "rgba(52,211,153,0.12)", color: "#34D399", border: "1px solid rgba(52,211,153,0.2)" }}>
                  WIB
                </span>
              )}
            </div>

            {animeList.map((anime, i) => {
              const accent = ACCENT_COLORS[i % ACCENT_COLORS.length];
              const timeStr = anime.airTime ? fmtWIB(anime.airTime) : null;

              return (
                <button
                  key={anime.animeId}
                  onClick={() => setLocation(`/anime/${anime.animeId}`)}
                  className="w-full text-left flex items-center gap-0 rounded-2xl transition-all duration-150 active:scale-[0.98] overflow-hidden"
                  style={{
                    background: "rgba(255,255,255,0.035)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
                  }}
                >
                  {/* Time column */}
                  <div
                    className="flex-shrink-0 flex flex-col items-center justify-center self-stretch px-3"
                    style={{
                      minWidth: 58,
                      background: timeStr ? `${accent}10` : "transparent",
                      borderRight: timeStr ? `1px solid ${accent}22` : "none",
                    }}
                  >
                    {timeStr ? (
                      <>
                        <span className="text-sm font-black tabular-nums leading-none"
                          style={{ color: accent }}>
                          {timeStr.split(":")[0]}
                        </span>
                        <span className="text-[10px] font-bold tabular-nums"
                          style={{ color: accent, opacity: 0.8 }}>
                          :{timeStr.split(":")[1]}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs font-bold" style={{ color: "#334155" }}>—</span>
                    )}
                  </div>

                  {/* Poster + info */}
                  <div className="flex items-center gap-3 flex-1 min-w-0 p-3">
                    <SchedulePoster title={anime.title} accent={accent} />

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold leading-snug line-clamp-2"
                        style={{ color: "#E2E8F0" }}>
                        {anime.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{
                            background: `${accent}22`,
                            color: accent,
                            border: `1px solid ${accent}44`,
                          }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full animate-pulse"
                            style={{ background: accent }} />
                          Ongoing
                        </span>
                        {timeStr && (
                          <span className="text-[10px] font-medium" style={{ color: "#475569" }}>
                            {timeStr} WIB
                          </span>
                        )}
                      </div>
                    </div>

                    <span className="flex-shrink-0 text-xs" style={{ color: "#334155" }}>▶</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
