export interface EventThumbnailData {
  image?: string;
  image_micro?: string;
  image_thumbnail?: string;
  image_medium?: string;
  image_full?: string;
  video_url?: string;
}

/**
 * PNG URL을 WebP로 변환
 */
function convertToWebP(url: string): string {
  if (!url) return url;
  // .png를 .webp로 변경
  return url.replace(/\.png$/i, '.webp');
}

/**
 * 이벤트의 썸네일 URL을 반환합니다.
 * 우선순위: image_micro > image_thumbnail > image_medium > image > 기본 썸네일
 */
export function getEventThumbnail(
  event: EventThumbnailData | null | undefined,
  defaultThumbnailClass?: string,
  defaultThumbnailEvent?: string
): string {
  if (!event) {
    // 기본 썸네일도 WebP로 변환
    return convertToWebP(defaultThumbnailEvent || '');
  }

  // 1순위: micro (달력용 100px)
  if (event?.image_micro) {
    return event.image_micro;
  }

  // 2순위: thumbnail (리스트용 400px)
  if (event?.image_thumbnail) {
    return event.image_thumbnail;
  }

  // 3순위: medium (모달용 1080px)
  if (event?.image_medium) {
    return event.image_medium;
  }

  // 4순위: image (full 또는 레거시)
  if (event?.image) {
    return event.image;
  }

  // 기본 썸네일 (WebP로 변환)
  const defaultUrl = event.video_url
    ? (defaultThumbnailClass || '')
    : (defaultThumbnailEvent || '');

  return convertToWebP(defaultUrl);
}
