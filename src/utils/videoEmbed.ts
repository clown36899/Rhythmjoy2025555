export interface VideoEmbedInfo {
  // 사용하지 않는 Vimeo 제거
  provider: "youtube" | "instagram" | "facebook" | null;
  embedUrl: string | null;
  thumbnailUrl: string | null;
  videoId: string | null;
}

/**
 * 주어진 URL을 분석하여 빌보드에서 사용할 임베드 정보를 반환합니다.
 * @param url 분석할 비디오 URL
 */
export function parseVideoUrl(url: string): VideoEmbedInfo {
  // 1. 초기 null/빈 문자열 체크
  if (!url || url.trim() === "") {
    return {
      provider: null,
      embedUrl: null,
      thumbnailUrl: null,
      videoId: null,
    };
  }

  const trimmedUrl = url.trim();

  // 2. YouTube 처리 (가장 중요)
  if (isYouTubeUrl(trimmedUrl)) {
    const videoId = extractYouTubeId(trimmedUrl);
    if (videoId) {
      const isShorts = isYouTubeShorts(trimmedUrl);

      // 💡 [YouTube 최적화] Kiosk 모드에 필수적인 최소 오버헤드 파라미터.
      // loop=1과 playlist=${videoId}는 영상 종료 시 끊김 없이 루프 재생을 보장합니다.
      const commonParams = `autoplay=1&mute=1&loop=1&playlist=${videoId}&playsinline=1&rel=0&modestbranding=1`;

      return {
        provider: "youtube",
        embedUrl: `https://www.youtube.com/embed/${videoId}?${commonParams}`,
        // Shorts 영상은 가로 비율 썸네일이 적절하지 않아 null 처리 유지
        thumbnailUrl: isShorts
          ? null
          : `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        videoId,
      };
    }
  }

  // 3. Instagram 처리
  if (isInstagramUrl(trimmedUrl)) {
    const match = trimmedUrl.match(/\/(p|reel|tv)\/([^/?]+)/);
    if (match) {
      const resourceId = match[2];
      const baseUrl = trimmedUrl.split("?")[0].replace(/\/$/, "");
      const embedUrl = `${baseUrl}/embed/`;
      return {
        provider: "instagram",
        embedUrl,
        thumbnailUrl: null,
        videoId: resourceId,
      };
    }
    // URL 형식은 인스타그램이지만 ID 추출 실패 시 null 반환
    return {
      provider: null,
      embedUrl: null,
      thumbnailUrl: null,
      videoId: null,
    };
  }

  // 4. Facebook 처리
  if (isFacebookUrl(trimmedUrl)) {
    const encodedUrl = encodeURIComponent(trimmedUrl);
    return {
      provider: "facebook",
      embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodedUrl}&show_text=false&autoplay=true&muted=true`,
      thumbnailUrl: null,
      videoId: null,
    };
  }

  // 5. Vimeo 로직 제거 완료

  // 6. 지원하지 않는 URL의 경우
  return { provider: null, embedUrl: null, thumbnailUrl: null, videoId: null };
}

// --- 헬퍼 함수 ---

function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com|youtu\.be)/.test(url);
}

function isYouTubeShorts(url: string): boolean {
  return /youtube\.com\/shorts\//.test(url);
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([^&]+)/,
    /(?:youtube\.com\/embed\/)([^?]+)/,
    /(?:youtube\.com\/v\/)([^?]+)/,
    /(?:youtu\.be\/)([^?]+)/,
    /(?:youtube\.com\/shorts\/)([^?]+)/,
    // [개선] youtube.com/watch?v=XXXXX&list=... 와 같은 경우를 위해,
    // &나 ? 이전의 문자열만 추출하는 패턴을 명확히 합니다.
    /v=([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1]; // 유효한 Video ID 반환
    }
  }

  return null;
}

function isInstagramUrl(url: string): boolean {
  return /instagram\.com/.test(url);
}

function isFacebookUrl(url: string): boolean {
  return /facebook\.com|fb\.watch/.test(url);
}

// Vimeo 관련 헬퍼 함수 제거 완료

export function isValidVideoUrl(url: string): boolean {
  if (!url || url.trim() === "") return true;
  const info = parseVideoUrl(url);
  return info.provider !== null && info.embedUrl !== null;
}

export function getVideoProviderName(url: string): string | null {
  const info = parseVideoUrl(url);
  if (!info.provider) return null;

  const names: Record<Exclude<VideoEmbedInfo["provider"], null>, string> = {
    youtube: "YouTube",
    instagram: "Instagram",
    facebook: "Facebook",
    // vimeo 제거
  };

  return names[info.provider] || null;
}
