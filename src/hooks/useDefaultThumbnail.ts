import { useState, useEffect } from 'react';
import { useBoardData } from '../contexts/BoardDataContext';

export function useDefaultThumbnail() {
  const { data: boardData, loading } = useBoardData();
  const [defaultThumbnailClass, setDefaultThumbnailClass] = useState<string>('');
  const [defaultThumbnailEvent, setDefaultThumbnailEvent] = useState<string>('');

  useEffect(() => {
    if (boardData?.billboard_settings) {
      const settings = boardData.billboard_settings;
      // The interface uses snake_case matching the RPC return
      setDefaultThumbnailClass(settings.default_thumbnail_class || '');
      setDefaultThumbnailEvent(settings.default_thumbnail_event || '');
    }
  }, [boardData]);

  return { defaultThumbnailClass, defaultThumbnailEvent, loading };
}
