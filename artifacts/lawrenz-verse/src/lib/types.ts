export type ContentType = "dracin" | "drakor" | "film" | "series";

export interface ContentCard {
  id: string;
  title: string;
  poster: string;
  href: string;
  type: ContentType;
  source: string;
  episodes?: string;
  rating?: string;
  year?: string;
  status?: "Ongoing" | "Completed";
  genres?: string[];
  country?: string;
  synopsis?: string;
  releaseDate?: string;
  views?: number;
  tmdbId?: number;
  mediaType?: "tv" | "movie";
  totalEpisodes?: number;
  totalSeasons?: number;
  drakoridSlug?: string;
}

export const CATEGORY_META: Record<ContentType, {
  label: string;
  emoji: string;
  primaryColor: string;
  secondaryColor: string;
  glowColor: string;
  bgGrad: string;
}> = {
  dracin: {
    label: "Dracin",
    emoji: "🐉",
    primaryColor: "#FB7185",
    secondaryColor: "#F472B6",
    glowColor: "rgba(251,113,133,0.38)",
    bgGrad: "linear-gradient(135deg, rgba(251,113,133,0.14) 0%, rgba(244,114,182,0.07) 100%)",
  },
  drakor: {
    label: "Drakor",
    emoji: "🇰🇷",
    primaryColor: "#F472B6",
    secondaryColor: "#A78BFA",
    glowColor: "rgba(244,114,182,0.38)",
    bgGrad: "linear-gradient(135deg, rgba(244,114,182,0.14) 0%, rgba(167,139,250,0.07) 100%)",
  },
  film: {
    label: "Film",
    emoji: "🎬",
    primaryColor: "#60A5FA",
    secondaryColor: "#818CF8",
    glowColor: "rgba(96,165,250,0.38)",
    bgGrad: "linear-gradient(135deg, rgba(96,165,250,0.14) 0%, rgba(129,140,248,0.07) 100%)",
  },
  series: {
    label: "Series",
    emoji: "📺",
    primaryColor: "#A78BFA",
    secondaryColor: "#60A5FA",
    glowColor: "rgba(167,139,250,0.38)",
    bgGrad: "linear-gradient(135deg, rgba(167,139,250,0.14) 0%, rgba(96,165,250,0.07) 100%)",
  },
};
