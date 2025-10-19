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

  // 2순위: 기본 썸네일 (영상이 있든 없든 사용)
  console.log('🖼️ getEventThumbnail 호출:', {
    hasImage: !!(event.image_thumbnail || event.image),
    hasVideo: !!event.video_url,
    defaultThumbnailUrl,
    willReturn: defaultThumbnailUrl || ''
  });
  return defaultThumbnailUrl || '';
}
