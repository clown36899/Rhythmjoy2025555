-- Add user_id column to shops table
ALTER TABLE public.shops 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Create index for user_id
CREATE INDEX IF NOT EXISTS idx_shops_user_id ON public.shops(user_id);

-- Enable RLS
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.featured_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to avoid conflicts
DROP POLICY IF EXISTS "Enable read access for all users" ON public.shops;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.shops;
DROP POLICY IF EXISTS "Enable update for owners" ON public.shops;
DROP POLICY IF EXISTS "Enable delete for owners" ON public.shops;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.featured_items;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.featured_items;
DROP POLICY IF EXISTS "Enable update for owners" ON public.featured_items;
DROP POLICY IF EXISTS "Enable delete for owners" ON public.featured_items;

-- Policies for shops

-- 1. READ: Everyone can read
CREATE POLICY "Enable read access for all users" ON public.shops
    FOR SELECT USING (true);

-- 2. INSERT: Authenticated users only
CREATE POLICY "Enable insert for authenticated users only" ON public.shops
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 3. UPDATE: Owner OR Legacy (user_id is null)
-- Note: Logic for legacy items relies on application-level password check. 
-- DB layer allows update on legacy items to authenticated users to support the legacy flow.
CREATE POLICY "Enable update for owners or legacy" ON public.shops
    FOR UPDATE USING (
        (auth.uid() = user_id) OR (user_id IS NULL)
    );

-- 4. DELETE: Owner OR Legacy
CREATE POLICY "Enable delete for owners or legacy" ON public.shops
    FOR DELETE USING (
        (auth.uid() = user_id) OR (user_id IS NULL)
    );


-- Policies for featured_items
-- Permissions mimic the parent shop's logic often, but simplified here:
-- If you can edit the shop, you should be able to edit items. 
-- However, RLS on items typically checks the item's own columns or joins.
-- A simple join check is expensive but correct. 
-- Simplified: Authenticated users can Insert. 
-- Update/Delete: Check via Join if user owns the shop.

-- 1. READ: Everyone
CREATE POLICY "Enable read access for all users" ON public.featured_items
    FOR SELECT USING (true);

-- 2. INSERT: Authenticated users
CREATE POLICY "Enable insert for authenticated users only" ON public.featured_items
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 3. UPDATE: Shop Owner OR Legacy Shop
CREATE POLICY "Enable update for shop owners" ON public.featured_items
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.shops
            WHERE shops.id = featured_items.shop_id
            AND (shops.user_id = auth.uid() OR shops.user_id IS NULL)
        )
    );

-- 4. DELETE: Shop Owner OR Legacy Shop
CREATE POLICY "Enable delete for shop owners" ON public.featured_items
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.shops
            WHERE shops.id = featured_items.shop_id
            AND (shops.user_id = auth.uid() OR shops.user_id IS NULL)
        )
    );
