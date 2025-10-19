import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useDefaultThumbnail() {
  const [defaultThumbnailClass, setDefaultThumbnailClass] = useState<string>('');
  const [defaultThumbnailEvent, setDefaultThumbnailEvent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDefaultThumbnails();
  }, []);

  const loadDefaultThumbnails = async () => {
    try {
      const { data, error } = await supabase
        .from('billboard_settings')
        .select('default_thumbnail_class, default_thumbnail_event')
        .eq('id', 1)
        .single();

      if (error) {
        console.error('Error loading default thumbnails:', error);
      } else if (data) {
        setDefaultThumbnailClass(data.default_thumbnail_class || '');
        setDefaultThumbnailEvent(data.default_thumbnail_event || '');
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  return { defaultThumbnailClass, defaultThumbnailEvent, loading };
}
