// utils/videoEmbed.ts
export interface VideoEmbedInfo {
  provider: "youtube" | null;
  embedUrl: string | null; // ← 추가됨
  thumbnailUrl: string | null;
  videoId: string | null;
  nativeUrl: string | null; // ← 기존 유지 (AndroidKiosk.playNativeVideo용)
}

export function parseVideoUrl(url: string): VideoEmbedInfo {
  if (!url?.trim()) {
    return {
      provider: null,
      embedUrl: null,
      thumbnailUrl: null,
      videoId: null,
      nativeUrl: null,
    };
  }

  const trimmed = url.trim();
  if (!/(youtube\.com|youtu\.be)/i.test(trimmed)) {
    return {
      provider: null,
      embedUrl: null,
      thumbnailUrl: null,
      videoId: null,
      nativeUrl: null,
    };
  }

  const videoId = extractYouTubeId(trimmed);
  if (!videoId) {
    return {
      provider: null,
      embedUrl: null,
      thumbnailUrl: null,
      videoId: null,
      nativeUrl: null,
    };
  }

  return {
    provider: "youtube",
    embedUrl: `https://www.youtube.com/embed/${videoId}`, // ← 자동 재생용
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    videoId,
    nativeUrl: trimmed, // ← 클릭 시 네이티브 재생용 (옵션)
  };
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
