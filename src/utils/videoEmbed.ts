// utils/videoEmbed.ts
export interface VideoEmbedInfo {
  provider: "youtube" | null;
  embedUrl: string | null; // ← 추가됨
  thumbnailUrl: string | null;
  videoId: string | null;
  nativeUrl: string | null; // ← 기존 유지 (AndroidKiosk.playNativeVideo용)
  width: number | null; // 영상 가로 크기 (Android 플레이어 비율 조정용)
  height: number | null; // 영상 세로 크기 (Android 플레이어 비율 조정용)
}

export function parseVideoUrl(url: string): VideoEmbedInfo {
  if (!url?.trim()) {
    return {
      provider: null,
      embedUrl: null,
      thumbnailUrl: null,
      videoId: null,
      nativeUrl: null,
      width: null,
      height: null,
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
      width: null,
      height: null,
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
      width: null,
      height: null,
    };
  }

  // YouTube Shorts는 세로 영상 (9:16), 일반 영상은 가로 (16:9)
  const isShorts = /\/shorts\//i.test(trimmed);
  const width = isShorts ? 1080 : 1920;
  const height = isShorts ? 1920 : 1080;

  return {
    provider: "youtube",
    embedUrl: `https://www.youtube.com/embed/${videoId}`, // ← 자동 재생용
    thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    videoId,
    nativeUrl: trimmed, // ← 클릭 시 네이티브 재생용 (옵션)
    width, // Android 플레이어 비율 조정용
    height, // Android 플레이어 비율 조정용
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

export function isValidVideoUrl(url: string): boolean {
  if (!url?.trim()) return false;
  const parsed = parseVideoUrl(url);
  return parsed.provider === "youtube" && !!parsed.videoId;
}

export function getVideoProviderName(url: string): string {
  if (!url?.trim()) return "";
  const parsed = parseVideoUrl(url);
  return parsed.provider === "youtube" ? "YouTube" : "";
}
