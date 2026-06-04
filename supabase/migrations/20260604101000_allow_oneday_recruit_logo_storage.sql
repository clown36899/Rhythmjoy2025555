-- Keep one-day recruit logo storage consistent with the event image folder strategy.
DROP POLICY IF EXISTS "images authenticated insert" ON storage.objects;

CREATE POLICY "images authenticated insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'images'
  and (storage.foldername(name))[1] in (
    'event-posters',
    'board-images',
    'profiles',
    'social-groups',
    'social-schedules',
    'venue-images',
    'shop-logos',
    'default-thumbnails',
    'webzine',
    'v2-main-ads',
    'oneday-recruit-logos'
  )
);
