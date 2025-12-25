-- [Social Revamp] Database Schema Setup
-- Run this in the Supabase SQL Editor to prepare the database for the new social features.

-- 1. Create social_groups table
CREATE TABLE IF NOT EXISTS public.social_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'club', -- 'club', 'bar', 'etc'
    image_url TEXT,
    description TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Modify social_schedules table to align with the new group-centric model
-- If the table exists, we add missing columns. If not, we create it.
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'social_schedules') THEN
        CREATE TABLE public.social_schedules (
            id SERIAL PRIMARY KEY,
            group_id INTEGER REFERENCES public.social_groups(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            date DATE,
            day_of_week INTEGER, -- 0:Sun ~ 6:Sat
            start_time TIME,
            description TEXT,
            image_url TEXT,
            image_micro TEXT,
            image_thumbnail TEXT,
            image_medium TEXT,
            image_full TEXT,
            venue_id UUID, -- Optional link to venues table
            place_name VARCHAR(255),
            address TEXT,
            user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
        );
    ELSE
        -- Add columns if they don't exist
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'social_schedules' AND column_name = 'group_id') THEN
            ALTER TABLE public.social_schedules ADD COLUMN group_id INTEGER REFERENCES public.social_groups(id) ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'social_schedules' AND column_name = 'image_micro') THEN
            ALTER TABLE public.social_schedules ADD COLUMN image_micro TEXT;
            ALTER TABLE public.social_schedules ADD COLUMN image_thumbnail TEXT;
            ALTER TABLE public.social_schedules ADD COLUMN image_medium TEXT;
            ALTER TABLE public.social_schedules ADD COLUMN image_full TEXT;
        END IF;

        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'social_schedules' AND column_name = 'place_name') THEN
            ALTER TABLE public.social_schedules ADD COLUMN place_name VARCHAR(255);
            ALTER TABLE public.social_schedules ADD COLUMN address TEXT;
        END IF;
        
        IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'social_schedules' AND column_name = 'venue_id') THEN
            ALTER TABLE public.social_schedules ADD COLUMN venue_id UUID;
        END IF;
    END IF;
END $$;

-- 3. Create social_group_favorites table
CREATE TABLE IF NOT EXISTS public.social_group_favorites (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    group_id INTEGER REFERENCES public.social_groups(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (user_id, group_id)
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.social_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_group_favorites ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- social_groups
DROP POLICY IF EXISTS "Public can view social_groups" ON public.social_groups;
CREATE POLICY "Public can view social_groups" ON public.social_groups FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert social_groups" ON public.social_groups;
CREATE POLICY "Authenticated users can insert social_groups" ON public.social_groups FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Owners can update social_groups" ON public.social_groups;
CREATE POLICY "Owners can update social_groups" ON public.social_groups FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners can delete social_groups" ON public.social_groups;
CREATE POLICY "Owners can delete social_groups" ON public.social_groups FOR DELETE USING (auth.uid() = user_id);

-- social_schedules
DROP POLICY IF EXISTS "Public can view social_schedules" ON public.social_schedules;
CREATE POLICY "Public can view social_schedules" ON public.social_schedules FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert social_schedules" ON public.social_schedules;
CREATE POLICY "Authenticated users can insert social_schedules" ON public.social_schedules FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Owners can update social_schedules" ON public.social_schedules;
CREATE POLICY "Owners can update social_schedules" ON public.social_schedules FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners can delete social_schedules" ON public.social_schedules;
CREATE POLICY "Owners can delete social_schedules" ON public.social_schedules FOR DELETE USING (auth.uid() = user_id);

-- social_group_favorites
DROP POLICY IF EXISTS "Users can view their own favorites" ON public.social_group_favorites;
CREATE POLICY "Users can view their own favorites" ON public.social_group_favorites FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage their own favorites" ON public.social_group_favorites;
CREATE POLICY "Users can manage their own favorites" ON public.social_group_favorites FOR ALL USING (auth.uid() = user_id);

-- 6. Updated At Triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_social_groups_updated_at ON public.social_groups;
CREATE TRIGGER update_social_groups_updated_at BEFORE UPDATE ON public.social_groups FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_social_schedules_updated_at ON public.social_schedules;
CREATE TRIGGER update_social_schedules_updated_at BEFORE UPDATE ON public.social_schedules FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
