-- Fix practice_room_favorites to reference venues(uuid) instead of practice_rooms(bigint)
-- Previous migration created it referencing practice_rooms(id) which was BIGINT, but we are using venues(id) which is UUID.

DROP TABLE IF EXISTS practice_room_favorites;

CREATE TABLE practice_room_favorites (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  practice_room_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, practice_room_id)
);

-- RLS Policies (Re-apply since table was dropped)
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

-- Indexes
CREATE INDEX idx_practice_room_favorites_user_id ON practice_room_favorites(user_id);
CREATE INDEX idx_practice_room_favorites_practice_room_id ON practice_room_favorites(practice_room_id);
