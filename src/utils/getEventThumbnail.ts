interface Event {
  image?: string;
  image_thumbnail?: string;
  video_url?: string;
}

export function getEventThumbnail(
  event: Event,
  defaultThumbnailUrl: string
): string {
  // 1순위: 이벤트 썸네일 또는 이미지
  if (event.image_thumbnail || event.image) {
    return event.image_thumbnail || event.image || '';
  }

  // 2순위: 비디오 URL이 없으면 기본 썸네일
  if (!event.video_url) {
    return defaultThumbnailUrl || '';
  }

  // 3순위: 비디오 URL이 있으면 빈 문자열 (배너에서 재생 아이콘 표시)
  return '';
}
