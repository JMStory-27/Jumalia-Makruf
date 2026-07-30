import { useState, useEffect } from "react";
import { fetchAniListBannerOnDemand, getCachedBanner } from "./anilist";
import { proxyImg } from "./utils";

/**
 * Returns the banner image URL for an anime — routed through the local proxy
 * so the image is cached on disk and always available (even if AniList CDN is slow/down).
 * Reads synchronously from localStorage/memory cache first → renders instantly on repeat visits.
 */
export function useBanner(title: string): string | null {
  const [banner, setBanner] = useState<string | null>(() => {
    if (!title) return null;
    const raw = getCachedBanner(title)?.banner ?? null;
    return raw ? proxyImg(raw) : null;
  });

  useEffect(() => {
    if (!title) return;
    const cached = getCachedBanner(title);
    if (cached?.banner) { setBanner(proxyImg(cached.banner)); return; }

    let cancelled = false;
    fetchAniListBannerOnDemand(title).then(({ banner: url }) => {
      if (!cancelled && url) setBanner(proxyImg(url));
    });
    return () => { cancelled = true; };
  }, [title]);

  return banner;
}
