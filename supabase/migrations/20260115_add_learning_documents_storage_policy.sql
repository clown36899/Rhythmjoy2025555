-- 1. Ensure learning-images bucket exists
INSERT INTO storage.buckets (id, name, public) 
VALUES ('learning-images', 'learning-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public can view learning document images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload learning document images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own learning document images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own learning document images" ON storage.objects;

-- 3. Create Policies

-- 3.1 VIEW: Public Read
CREATE POLICY "Public can view learning document images"
ON storage.objects FOR SELECT
USING ( 
    bucket_id = 'learning-images' AND 
    (storage.foldername(name))[1] = 'documents' 
);

-- 3.2 INSERT: Authenticated Users
CREATE POLICY "Authenticated users can upload learning document images"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'learning-images' AND 
    (storage.foldername(name))[1] = 'documents' AND
    auth.role() = 'authenticated'
);

-- 3.3 UPDATE: Owner only
CREATE POLICY "Users can update their own learning document images"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'learning-images' AND 
    (storage.foldername(name))[1] = 'documents' AND
    auth.uid() = owner
);

-- 3.4 DELETE: Owner only (Admins typically handled by superuser bypass, preventing complex query here)
CREATE POLICY "Users can delete their own learning document images"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'learning-images' AND 
    (storage.foldername(name))[1] = 'documents' AND
    auth.uid() = owner
);
