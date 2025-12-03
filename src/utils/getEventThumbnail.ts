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
  // 1순위: 이벤트 썸네일만 허용 (트래픽 절감)
  // 원본 이미지(event.image)는 용량이 클 수 있으므로 리스트에서는 로드하지 않음
  if (event?.image_thumbnail) {
    return event.image_thumbnail;
  }

  // 2순위: 카테고리별 기본 썸네일 (영상이 있든 없든 사용)
  const defaultUrl = event?.category === 'class' ? defaultThumbnailClass : defaultThumbnailEvent;
  return defaultUrl || '';
}
