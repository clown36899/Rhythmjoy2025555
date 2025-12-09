-- Add password column to shops table for edit authentication
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS password TEXT;

-- Update RLS policies to allow updates with password verification
-- Note: Password verification will be handled in the application layer
CREATE POLICY "Enable update for users with correct password" ON public.shops
    FOR UPDATE USING (true);

CREATE POLICY "Enable update for featured items" ON public.featured_items
    FOR UPDATE USING (true);

-- Enable delete policies as well
CREATE POLICY "Enable delete for users with correct password" ON public.shops
    FOR DELETE USING (true);

CREATE POLICY "Enable delete for featured items" ON public.featured_items
    FOR DELETE USING (true);
