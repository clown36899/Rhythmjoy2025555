import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useDefaultThumbnail() {
  // localStorage에서 즉시 로드 (타이밍 문제 해결)
  const cachedUrl = typeof window !== 'undefined' ? localStorage.getItem('cached_default_thumbnail') || '' : '';
  const [defaultThumbnailUrl, setDefaultThumbnailUrl] = useState<string>(cachedUrl);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDefaultThumbnail();
  }, []);

  const loadDefaultThumbnail = async () => {
    try {
      const { data, error } = await supabase
        .from('billboard_settings')
        .select('default_thumbnail_url')
        .eq('id', 1)
        .single();

      if (error) {
        console.error('Error loading default thumbnail:', error);
      } else if (data) {
        const url = data.default_thumbnail_url || '';
        setDefaultThumbnailUrl(url);
        // DB 값으로 localStorage 업데이트
        if (url) {
          localStorage.setItem('cached_default_thumbnail', url);
        }
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return { defaultThumbnailUrl, loading };
}
