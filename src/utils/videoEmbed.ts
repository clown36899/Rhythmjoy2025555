export interface VideoEmbedInfo {
  provider: 'youtube' | 'instagram' | 'facebook' | 'vimeo' | null;
  embedUrl: string | null;
  thumbnailUrl: string | null;
  videoId: string | null;
}

export function parseVideoUrl(url: string): VideoEmbedInfo {
  if (!url || url.trim() === '') {
    return { provider: null, embedUrl: null, thumbnailUrl: null, videoId: null };
  }

  const trimmedUrl = url.trim();

  if (isYouTubeUrl(trimmedUrl)) {
    const videoId = extractYouTubeId(trimmedUrl);
    if (videoId) {
      return {
        provider: 'youtube',
        embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}`,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        videoId,
      };
    }
  }

  if (isInstagramUrl(trimmedUrl)) {
    const match = trimmedUrl.match(/\/(p|reel|tv)\/([^/?]+)/);
    if (match) {
      const resourceType = match[1];
      const resourceId = match[2];
      const baseUrl = trimmedUrl.split('?')[0].replace(/\/$/, '');
      const embedUrl = `${baseUrl}/embed/`;
      return {
        provider: 'instagram',
        embedUrl,
        thumbnailUrl: null,
        videoId: resourceId,
      };
    }
    return {
      provider: null,
      embedUrl: null,
      thumbnailUrl: null,
      videoId: null,
    };
  }

  if (isFacebookUrl(trimmedUrl)) {
    const encodedUrl = encodeURIComponent(trimmedUrl);
    return {
      provider: 'facebook',
      embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodedUrl}&show_text=false&autoplay=true&muted=true`,
      thumbnailUrl: null,
      videoId: null,
    };
  }

  if (isVimeoUrl(trimmedUrl)) {
    const videoId = extractVimeoId(trimmedUrl);
    if (videoId) {
      return {
        provider: 'vimeo',
        embedUrl: `https://player.vimeo.com/video/${videoId}?autoplay=1&muted=1&loop=1`,
        thumbnailUrl: null,
        videoId,
      };
    }
  }

  return { provider: null, embedUrl: null, thumbnailUrl: null, videoId: null };
}

function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com|youtu\.be)/.test(url);
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([^&]+)/,
    /(?:youtube\.com\/embed\/)([^?]+)/,
    /(?:youtube\.com\/v\/)([^?]+)/,
    /(?:youtu\.be\/)([^?]+)/,
    /(?:youtube\.com\/shorts\/)([^?]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

function isInstagramUrl(url: string): boolean {
  return /instagram\.com/.test(url);
}

function isFacebookUrl(url: string): boolean {
  return /facebook\.com|fb\.watch/.test(url);
}

function isVimeoUrl(url: string): boolean {
  return /vimeo\.com/.test(url);
}

function extractVimeoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(\d+)/);
  return match ? match[1] : null;
}

export function isValidVideoUrl(url: string): boolean {
  if (!url || url.trim() === '') return true;
  const info = parseVideoUrl(url);
  return info.provider !== null && info.embedUrl !== null;
}

export function getVideoProviderName(url: string): string | null {
  const info = parseVideoUrl(url);
  if (!info.provider) return null;

  const names: Record<string, string> = {
    youtube: 'YouTube',
    instagram: 'Instagram',
    facebook: 'Facebook',
    vimeo: 'Vimeo',
  };

  return names[info.provider] || null;
}
