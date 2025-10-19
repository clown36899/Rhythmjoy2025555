import { useState, useEffect } from 'react';

const DEFAULT_THUMBNAIL_KEY = 'default_thumbnail_url';

export function useDefaultThumbnail() {
  const [defaultThumbnailUrl, setDefaultThumbnailUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDefaultThumbnail();
  }, []);

  const loadDefaultThumbnail = () => {
    try {
      const stored = localStorage.getItem(DEFAULT_THUMBNAIL_KEY);
      setDefaultThumbnailUrl(stored || '');
    } catch (error) {
      console.error('Error loading default thumbnail:', error);
    } finally {
      setLoading(false);
    }
  };

  return { defaultThumbnailUrl, loading };
}
