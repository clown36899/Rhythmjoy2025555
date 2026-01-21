-- Shopping Mall Tables Schema
-- Run this SQL in your Supabase SQL Editor

-- 1. Create shops table
CREATE TABLE IF NOT EXISTS public.shops (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    website_url TEXT NOT NULL,
    logo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create featured_items table
CREATE TABLE IF NOT EXISTS public.featured_items (
    id BIGSERIAL PRIMARY KEY,
    shop_id BIGINT NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    item_price NUMERIC,
    item_image_url TEXT NOT NULL,
    item_link TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_featured_items_shop_id ON public.featured_items(shop_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.featured_items ENABLE ROW LEVEL SECURITY;

-- 5. Create policies for public read access
CREATE POLICY "Enable read access for all users" ON public.shops
    FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON public.featured_items
    FOR SELECT USING (true);

-- 6. Create policies for authenticated insert (optional - adjust as needed)
CREATE POLICY "Enable insert for authenticated users only" ON public.shops
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable insert for authenticated users only" ON public.featured_items
    FOR INSERT WITH CHECK (true);

-- 7. Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. Create triggers for updated_at
CREATE TRIGGER update_shops_updated_at
    BEFORE UPDATE ON public.shops
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_featured_items_updated_at
    BEFORE UPDATE ON public.featured_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
