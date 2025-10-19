interface Event {
  image?: string;
  image_thumbnail?: string;
  video_url?: string;
  category?: string;
}

export function getEventThumbnail(
  event: Event,
  defaultThumbnailClass: string,
  defaultThumbnailEvent: string
): string {
  // 1순위: 이벤트 썸네일 또는 이미지
  if (event.image_thumbnail || event.image) {
    return event.image_thumbnail || event.image || '';
  }

  // 2순위: 카테고리별 기본 썸네일 (영상이 있든 없든 사용)
  const defaultUrl = event.category === 'class' ? defaultThumbnailClass : defaultThumbnailEvent;
  return defaultUrl || '';
}
