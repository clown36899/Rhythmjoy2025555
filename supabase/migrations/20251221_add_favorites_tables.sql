-- Add favorites tables for practice rooms and shopping mall
-- Created: 2025-12-21

-- Practice Room Favorites Table
CREATE TABLE IF NOT EXISTS practice_room_favorites (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  practice_room_id BIGINT NOT NULL REFERENCES practice_rooms(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, practice_room_id)
);

-- Shop Favorites Table
CREATE TABLE IF NOT EXISTS shop_favorites (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id BIGINT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, shop_id)
);

-- RLS Policies for Practice Room Favorites
ALTER TABLE practice_room_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own practice room favorites"
  ON practice_room_favorites FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own practice room favorites"
  ON practice_room_favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own practice room favorites"
  ON practice_room_favorites FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for Shop Favorites
ALTER TABLE shop_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own shop favorites"
  ON shop_favorites FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own shop favorites"
  ON shop_favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own shop favorites"
  ON shop_favorites FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_practice_room_favorites_user_id ON practice_room_favorites(user_id);
CREATE INDEX idx_practice_room_favorites_practice_room_id ON practice_room_favorites(practice_room_id);
CREATE INDEX idx_shop_favorites_user_id ON shop_favorites(user_id);
CREATE INDEX idx_shop_favorites_shop_id ON shop_favorites(shop_id);
