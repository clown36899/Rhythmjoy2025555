-- Create venues table for managing practice rooms, swing bars, and other locations
CREATE TABLE IF NOT EXISTS venues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category VARCHAR(50) NOT NULL,
  name VARCHAR(200) NOT NULL,
  address TEXT,
  phone VARCHAR(50),
  description TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  website_url TEXT,
  map_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  display_order INT DEFAULT 0
);

-- Create index for category filtering
CREATE INDEX IF NOT EXISTS idx_venues_category ON venues(category) WHERE is_active = true;

-- Add venue-related columns to events table
ALTER TABLE events 
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS venue_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS venue_custom_link TEXT;

-- Enable RLS
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "venues_select_policy" ON venues;
DROP POLICY IF EXISTS "venues_insert_policy" ON venues;
DROP POLICY IF EXISTS "venues_update_policy" ON venues;
DROP POLICY IF EXISTS "venues_delete_policy" ON venues;

-- RLS Policies for venues
CREATE POLICY "venues_select_policy" ON venues 
  FOR SELECT 
  USING (is_active = true);

CREATE POLICY "venues_insert_policy" ON venues 
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "venues_update_policy" ON venues 
  FOR UPDATE 
  USING (true);

CREATE POLICY "venues_delete_policy" ON venues 
  FOR DELETE 
  USING (true);


-- Insert initial venue data (migrate from practice_rooms if exists)
DO $$
BEGIN
  -- Check if practice_rooms table exists
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'practice_rooms') THEN
    -- Migrate existing practice_rooms data to venues
    INSERT INTO venues (category, name, address, phone, description, images, website_url, map_url, created_at, is_active, display_order)
    SELECT 
      '연습실' as category,
      name,
      address,
      NULL as phone,  -- practice_rooms doesn't have contact_info column
      description,
      CASE 
        WHEN images IS NOT NULL THEN to_jsonb(images)
        ELSE '[]'::jsonb
      END as images,
      additional_link as website_url,
      address_link as map_url,
      created_at,
      true as is_active,
      0 as display_order
    FROM practice_rooms
    WHERE name IS NOT NULL
    ON CONFLICT DO NOTHING;
    
    RAISE NOTICE 'Migrated % practice rooms to venues table', (SELECT COUNT(*) FROM practice_rooms WHERE name IS NOT NULL);
  ELSE
    -- If practice_rooms doesn't exist, insert sample data
    INSERT INTO venues (category, name, address, description, images, display_order, map_url)
    VALUES 
      (
        '연습실', 
        '리듬앤조이 연습실', 
        '서울시 강남구 테헤란로 123', 
        '스윙댄스 전용 연습실입니다. 넓은 공간과 좋은 음향 시설을 갖추고 있습니다.',
        '[]'::jsonb, 
        1,
        'https://naver.me/example1'
      ),
      (
        '스윙바', 
        '스윙바 홍대점', 
        '서울시 마포구 홍익로 456', 
        '스윙댄스를 즐길 수 있는 바입니다. 매주 금요일 소셜 댄스가 열립니다.',
        '[]'::jsonb, 
        1,
        'https://naver.me/example2'
      )
    ON CONFLICT DO NOTHING;
    
    RAISE NOTICE 'Inserted sample venue data';
  END IF;
END $$;



-- Add comment
COMMENT ON TABLE venues IS 'Stores venue information for practice rooms, swing bars, and other locations';
COMMENT ON COLUMN venues.category IS 'Category of venue (e.g., 연습실, 스윙바)';
COMMENT ON COLUMN events.venue_id IS 'Reference to registered venue (if selected from venue list)';
COMMENT ON COLUMN events.venue_name IS 'Custom venue name (if entered manually)';
COMMENT ON COLUMN events.venue_custom_link IS 'Custom link for manually entered venues';

