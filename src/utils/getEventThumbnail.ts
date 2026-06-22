export interface EventThumbnailData {
  image?: string;
  image_url?: string;
  image_micro?: string;
  image_thumbnail?: string;
  image_medium?: string;
  image_full?: string;
  video_url?: string | null;
}

const DEFAULT_THUMBNAIL_BASE = '/uploads/images/default-thumbnails';
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

type ImageField = 'image_micro' | 'image_thumbnail' | 'image_medium' | 'image' | 'image_full' | 'image_url';

const LIGHTWEIGHT_CARD_FIELDS: ImageField[] = ['image_thumbnail', 'image_medium', 'image_micro'];
const LIGHTWEIGHT_THUMBNAIL_FIELDS: ImageField[] = ['image_micro', 'image_thumbnail', 'image_medium'];
const DISPLAY_IMAGE_FIELDS: ImageField[] = ['image_medium', 'image_thumbnail', 'image_micro', 'image', 'image_full', 'image_url'];

function normalizeImageUrl(value: string | undefined | null): string {
  return String(value || '').trim();
}

function getImageFieldValue(event: EventThumbnailData, field: ImageField): string | undefined {
  return normalizeImageUrl(event[field]) || undefined;
}

function isFullSizeAlias(event: EventThumbnailData, url: string | undefined): boolean {
  const normalized = normalizeImageUrl(url);
  if (!normalized) return false;

  return [event.image, event.image_full]
    .map(normalizeImageUrl)
    .filter(Boolean)
    .includes(normalized);
}

export function getLightweightEventImage(
  event: EventThumbnailData | null | undefined,
  fields: ImageField[] = LIGHTWEIGHT_THUMBNAIL_FIELDS,
): string | undefined {
  if (!event) return undefined;

  for (const field of fields) {
    const candidate = getImageFieldValue(event, field);
    if (!candidate) continue;
    if (field === 'image' || field === 'image_full' || field === 'image_url') continue;
    if (isFullSizeAlias(event, candidate)) continue;
    return candidate;
  }

  return undefined;
}

export function getEventDisplayImage(
  event: EventThumbnailData | null | undefined,
  fallback?: string,
): string {
  if (!event) return fallback || DEFAULT_THUMBNAILS.thumbnail;

  for (const field of DISPLAY_IMAGE_FIELDS) {
    const candidate = field === 'image_micro'
      ? getLightweightEventImage(event, ['image_micro'])
      : getImageFieldValue(event, field);
    if (candidate) return candidate;
  }

  return fallback || DEFAULT_THUMBNAILS.thumbnail;
}

/**
 * 이미지 URL을 그대로 반환합니다.
 */
export function getOptimizedImageUrl(url: string | ImageObject | undefined | null, _width: number, _quality = 80): string | undefined {
  if (!url) return undefined;

  // Handle object structure if passed (e.g. { url: '...', isThumbnail: true }) or structured image objects
  const actualUrl = typeof url === 'string' ? url : (url.url || url.thumbnail || url.medium || url.full || url.micro);

  if (!actualUrl || typeof actualUrl !== 'string') return undefined;

  // 이미 변환 파라미터가 있거나 data URL인 경우 패스
  if (actualUrl.includes('?') || actualUrl.startsWith('data:')) return actualUrl;

  // 레거시 Storage URL은 서버 데이터 이관 과정에서 /uploads로 치환합니다.
  if (actualUrl.includes('/storage/v1/object/public/')) {
    // Remote image transformation logic removed by user request.
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

  const lightweightImage = getLightweightEventImage(event, LIGHTWEIGHT_CARD_FIELDS);
  return lightweightImage ? getOptimizedImageUrl(lightweightImage, 400) : undefined;
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

  const lightweightImage = getLightweightEventImage(event);
  if (lightweightImage) return lightweightImage;

  // 기본 썸네일 - thumbnail 크기 사용
  return DEFAULT_THUMBNAILS.thumbnail;
}
