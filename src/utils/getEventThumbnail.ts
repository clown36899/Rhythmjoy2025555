import { parseVideoUrl } from './videoEmbed';

interface Event {
  image?: string;
  video_url?: string;
}

export function getEventThumbnail(
  event: Event,
  defaultThumbnailUrl: string
): string {
  if (event.image) {
    return event.image;
  }

  if (event.video_url) {
    const videoInfo = parseVideoUrl(event.video_url);
    
    if (videoInfo.provider === 'instagram' || videoInfo.provider === 'facebook') {
      return defaultThumbnailUrl || '';
    }
  }

  return defaultThumbnailUrl || '';
}
