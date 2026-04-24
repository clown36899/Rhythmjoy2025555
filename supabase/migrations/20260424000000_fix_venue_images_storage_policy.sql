-- Fix storage RLS policies for images bucket to support nested folder structure
-- New path format: venue-images/{venueId}/{idx}.webp (previously flat: venue-images/{filename}.webp)

-- Drop existing storage policies for images bucket (recreate with broader path matching)
DROP POLICY IF EXISTS "venue images upload policy" ON storage.objects;
DROP POLICY IF EXISTS "venue images update policy" ON storage.objects;
DROP POLICY IF EXISTS "venue images delete policy" ON storage.objects;
DROP POLICY IF EXISTS "venue images select policy" ON storage.objects;

-- Allow any authenticated user to INSERT into venue-images/ folder (any depth)
CREATE POLICY "venue images insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'images'
  AND (storage.foldername(name))[1] = 'venue-images'
);

-- Allow any authenticated user to UPDATE venue-images files (needed for upsert)
CREATE POLICY "venue images update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'images'
  AND (storage.foldername(name))[1] = 'venue-images'
)
WITH CHECK (
  bucket_id = 'images'
  AND (storage.foldername(name))[1] = 'venue-images'
);

-- Allow any authenticated user to DELETE venue-images files
CREATE POLICY "venue images delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'images'
  AND (storage.foldername(name))[1] = 'venue-images'
);

-- Allow public SELECT for venue-images (public bucket)
CREATE POLICY "venue images public select"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'images'
  AND (storage.foldername(name))[1] = 'venue-images'
);
