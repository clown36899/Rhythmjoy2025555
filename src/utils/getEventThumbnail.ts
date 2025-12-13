export interface EventThumbnailData {
  image?: string;
  image_micro?: string;
  image_thumbnail?: string;
  image_medium?: string;
  image_full?: string;
  video_url?: string;
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
    return defaultThumbnailEvent || '';
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

  // 기본 썸네일
  return event.video_url
    ? (defaultThumbnailClass || '')
    : (defaultThumbnailEvent || '');
}
