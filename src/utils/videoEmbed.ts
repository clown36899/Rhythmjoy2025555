export interface VideoEmbedInfo {
  provider: "youtube" | null;
  embedUrl: string | null;
  thumbnailUrl: string | null;
  videoId: string | null;
}

/**
 * 유튜브 URL만 분석 → H.264 강제 임베드 URL 생성
 * fmt=18 → 유튜브가 H.264 스트림만 제공 → VP9 차단 효과!
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

  // H.264 강제 파라미터
  const h264Params = `fmt=18&format=mp4`;

  // 기존 파라미터 + H.264 강제
  const baseParams = `autoplay=1&mute=1&loop=1&playlist=${videoId}&playsinline=1&rel=0&modestbranding=1&controls=0&fs=0`;
  const finalParams = `${baseParams}&${h264Params}`;

  return {
    provider: "youtube",
    embedUrl: `https://www.youtube.com/embed/${videoId}?${finalParams}`,
    thumbnailUrl: isShorts
      ? null
      : `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    videoId,
  };
}

// --- 헬퍼 함수 ---
function isYouTubeUrl(url: string): boolean {
  return /(youtube\.com|youtu\.be)/i.test(url);
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
