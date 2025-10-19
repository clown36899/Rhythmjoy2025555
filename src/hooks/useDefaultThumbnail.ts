import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useDefaultThumbnail() {
  const [defaultThumbnailUrl, setDefaultThumbnailUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDefaultThumbnail();
  }, []);

  const loadDefaultThumbnail = async () => {
    try {
      const { data, error } = await supabase
        .from('site_settings')
        .select('default_thumbnail_url')
        .eq('id', 1)
        .single();

      if (error) {
        console.error('Error loading default thumbnail:', error);
      } else if (data) {
        setDefaultThumbnailUrl(data.default_thumbnail_url || '');
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return { defaultThumbnailUrl, loading };
}
