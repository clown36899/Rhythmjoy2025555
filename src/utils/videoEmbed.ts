export interface VideoEmbedInfo {
  provider: "youtube" | null;
  embedUrl: string | null;
  thumbnailUrl: string | null;
  videoId: string | null;
}

/**
 * 유튜브 URL만 분석 → 임베드 정보 반환
 * 다른 플랫폼은 무조건 null 처리
 */
export function parseVideoUrl(url: string): VideoEmbedInfo {
  if (!url || url.trim() === "") {
    return {
      provider: null,
      embedUrl: null,
      thumbnailUrl: null,
      videoId: null,
    };
  }

  const trimmedUrl = url.trim();

  // 유튜브만 허용
  if (!isYouTubeUrl(trimmedUrl)) {
    return {
      provider: null,
      embedUrl: null,
      thumbnailUrl: null,
      videoId: null,
    };
  }

  const videoId = extractYouTubeId(trimmedUrl);
  if (!videoId) {
    return {
      provider: null,
      embedUrl: null,
      thumbnailUrl: null,
      videoId: null,
    };
  }

  const isShorts = /shorts/.test(trimmedUrl);
  const params = `autoplay=1&mute=1&loop=1&playlist=${videoId}&playsinline=1&rel=0&modestbranding=1&controls=0&fs=0`;

  return {
    provider: "youtube",
    embedUrl: `https://www.youtube.com/embed/${videoId}?${params}`,
    thumbnailUrl: isShorts
      ? null
      : `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    videoId,
  };
}

// --- 헬퍼 함수 ---
function isYouTubeUrl(url: string): boolean {
  return /(youtube\.com|youtu\.be)/.test(url);
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /embed\/([a-zA-Z0-9_-]{11})/,
    /v\/([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /shorts\/([a-zA-Z0-9_-]{11})/,
    /watch\?v=([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1] && m[1].length === 11) return m[1];
  }
  return null;
}

// --- 유틸 ---
export function isValidVideoUrl(url: string): boolean {
  const info = parseVideoUrl(url);
  return info.provider === "youtube" && info.embedUrl !== null;
}

export function getVideoProviderName(): "YouTube" {
  return "YouTube";
}
