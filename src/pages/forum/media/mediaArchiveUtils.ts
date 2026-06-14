export type MediaPlatform = 'youtube' | 'instagram' | 'other';

export type MediaType = 'video' | 'shorts' | 'reel' | 'post' | 'playlist' | 'link';

export interface SnsMediaItem {
  id: string;
  platform: MediaPlatform;
  media_type: MediaType;
  title: string;
  url: string;
  normalized_url: string;
  external_id?: string | null;
  description?: string | null;
  author_name?: string | null;
  thumbnail_url?: string | null;
  embed_url?: string | null;
  tags?: string[];
  tags_text?: string;
  archive_bucket?: string | null;
  collection_name?: string | null;
  dance_genre?: string | null;
  source_context?: string | null;
  is_approved?: boolean;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at?: string;
  updated_at?: string;
  approved_at?: string | null;
  approved_by?: string | null;
  published_at?: string | null;
  search_text?: string;
}

export interface ParsedMediaUrl {
  platform: MediaPlatform;
  media_type: MediaType;
  normalized_url: string;
  external_id: string | null;
  thumbnail_url: string | null;
  embed_url: string | null;
}

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{6,}$/;

function normalizeInputUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function stripTrailingSlash(pathname: string) {
  return pathname.replace(/\/+$/, '');
}

function parseYouTube(url: URL): ParsedMediaUrl | null {
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  let videoId: string | null = null;
  let mediaType: MediaType = 'video';

  if (host === 'youtu.be') {
    videoId = stripTrailingSlash(url.pathname).split('/').filter(Boolean)[0] || null;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const parts = stripTrailingSlash(url.pathname).split('/').filter(Boolean);
    if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v');
    } else if (parts[0] === 'shorts') {
      videoId = parts[1] || null;
      mediaType = 'shorts';
    } else if (parts[0] === 'embed') {
      videoId = parts[1] || null;
    } else if (parts[0] === 'playlist') {
      const listId = url.searchParams.get('list');
      return {
        platform: 'youtube',
        media_type: 'playlist',
        normalized_url: listId ? `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}` : url.toString(),
        external_id: listId,
        thumbnail_url: null,
        embed_url: listId ? `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(listId)}` : null,
      };
    }
  }

  if (!videoId || !YOUTUBE_ID_RE.test(videoId)) return null;

  const normalizedUrl = mediaType === 'shorts'
    ? `https://www.youtube.com/shorts/${videoId}`
    : `https://www.youtube.com/watch?v=${videoId}`;

  return {
    platform: 'youtube',
    media_type: mediaType,
    normalized_url: normalizedUrl,
    external_id: videoId,
    thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    embed_url: `https://www.youtube-nocookie.com/embed/${videoId}`,
  };
}

function parseInstagram(url: URL): ParsedMediaUrl | null {
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  if (host !== 'instagram.com') return null;

  const parts = stripTrailingSlash(url.pathname).split('/').filter(Boolean);
  const kind = parts[0];
  const shortcode = parts[1] || null;
  if (!shortcode || !['p', 'reel', 'tv'].includes(kind)) return null;

  const mediaType: MediaType = kind === 'reel' ? 'reel' : kind === 'tv' ? 'video' : 'post';

  return {
    platform: 'instagram',
    media_type: mediaType,
    normalized_url: `https://www.instagram.com/${kind}/${shortcode}/`,
    external_id: shortcode,
    thumbnail_url: null,
    embed_url: null,
  };
}

export function parseMediaUrl(input: string): ParsedMediaUrl | null {
  try {
    const normalized = normalizeInputUrl(input);
    if (!normalized) return null;
    const url = new URL(normalized);
    return parseYouTube(url) || parseInstagram(url) || {
      platform: 'other',
      media_type: 'link',
      normalized_url: url.toString(),
      external_id: null,
      thumbnail_url: null,
      embed_url: null,
    };
  } catch {
    return null;
  }
}

export function platformLabel(platform: MediaPlatform) {
  if (platform === 'youtube') return 'YouTube';
  if (platform === 'instagram') return 'Instagram';
  return 'Link';
}

export function mediaTypeLabel(type: MediaType) {
  const labels: Record<MediaType, string> = {
    video: '영상',
    shorts: 'Shorts',
    reel: 'Reels',
    post: '게시물',
    playlist: '플레이리스트',
    link: '링크',
  };
  return labels[type] || type;
}

export function normalizeTags(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function buildSearchText(item: Partial<SnsMediaItem>) {
  return [
    item.title,
    item.description,
    item.author_name,
    item.platform,
    item.media_type,
    item.archive_bucket,
    item.collection_name,
    item.dance_genre,
    item.source_context,
    ...(item.tags || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
