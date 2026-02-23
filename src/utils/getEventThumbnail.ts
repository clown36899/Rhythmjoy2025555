export interface EventThumbnailData {
  image?: string;
  image_micro?: string;
  image_thumbnail?: string;
  image_medium?: string;
  image_full?: string;
  video_url?: string | null;
}

// 기본 썸네일 URL (Supabase Storage)
const DEFAULT_THUMBNAIL_BASE = 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/images/default-thumbnails';
const DEFAULT_THUMBNAILS = {
  micro: `${DEFAULT_THUMBNAIL_BASE}/default_micro.webp`,
  thumbnail: `${DEFAULT_THUMBNAIL_BASE}/default_thumbnail.webp`,
  medium: `${DEFAULT_THUMBNAIL_BASE}/default_medium.webp`,
};

export interface ImageObject {
  url?: string;
  thumbnail?: string;
  medium?: string;
  full?: string;
  micro?: string;
}

/**
 * Supabase Storage URL에 이미지 변환 파라미터를 추가합니다.
 */
export function getOptimizedImageUrl(url: string | ImageObject | undefined | null, _width: number, _quality = 80): string | undefined {
  if (!url) return undefined;

  // Handle object structure if passed (e.g. { url: '...', isThumbnail: true }) or structured image objects
  const actualUrl = typeof url === 'string' ? url : (url.url || url.thumbnail || url.medium || url.full || url.micro);

  if (!actualUrl || typeof actualUrl !== 'string') return undefined;

  // 이미 변환 파라미터가 있거나 data URL인 경우 패스
  if (actualUrl.includes('?') || actualUrl.startsWith('data:')) return actualUrl;

  // Supabase Storage URL인지 확인
  if (actualUrl.includes('/storage/v1/object/public/')) {
    // Supabase Image Transformation Logic Removed by User Request
    return actualUrl;
  }

  return actualUrl;
}

/**
 * 이벤트 카드용 썸네일 (약 400px)
 * 우선순위: image_thumbnail > image_medium (resized) > image (resized) > image_micro
 */
export function getCardThumbnail(
  event: EventThumbnailData | null | undefined,
): string | undefined {
  if (!event) return undefined;

  // 1. Thumbnail (Ideal)
  if (event.image_thumbnail) return event.image_thumbnail;

  // 2. Medium (Resize to 400)
  if (event.image_medium) return getOptimizedImageUrl(event.image_medium, 400);

  // 3. Full Image (Resize to 400)
  if (event.image) return getOptimizedImageUrl(event.image, 400);

  // 4. Fallback to Micro if nothing else (might be blurry but better than empty)
  if (event.image_micro) return event.image_micro;

  return undefined;
}

/**
 * 이벤트의 썸네일 URL을 반환합니다.
 * 우선순위: image_micro > image_thumbnail > image_medium > image > 기본 썸네일
 */
export function getEventThumbnail(
  event: EventThumbnailData | null | undefined,
  _defaultThumbnailClass?: string,
  _defaultThumbnailEvent?: string
): string {
  if (!event) {
    // 이벤트가 없으면 thumbnail 크기 반환
    return DEFAULT_THUMBNAILS.thumbnail;
  }

  // 1순위: micro (달력용 100px)
  if (event?.image_micro) {
    return event.image_micro;
  }

  // 2순위: thumbnail (리스트용 400px)
  if (event?.image_thumbnail) {
    return event.image_thumbnail;
  }

  // 3순위: medium (모달용 650px)
  if (event?.image_medium) {
    return event.image_medium;
  }

  // 4순위: image (full 또는 레거시)
  if (event?.image) {
    return event.image;
  }

  // 기본 썸네일 - thumbnail 크기 사용
  return DEFAULT_THUMBNAILS.thumbnail;
}
