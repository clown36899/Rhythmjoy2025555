-- 1. Create Learning Categories Table (Hierarchical)
CREATE TABLE IF NOT EXISTS learning_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES learning_categories(id) ON DELETE CASCADE, -- Recursive FK
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add category_id to learning_playlists
ALTER TABLE learning_playlists ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES learning_categories(id) ON DELETE SET NULL;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_learning_categories_parent ON learning_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_learning_categories_order ON learning_categories(order_index);
CREATE INDEX IF NOT EXISTS idx_learning_playlists_category_id ON learning_playlists(category_id);

-- 4. RLS for Categories
ALTER TABLE learning_categories ENABLE ROW LEVEL SECURITY;

-- Public can view all categories
CREATE POLICY "Public can view categories"
  ON learning_categories FOR SELECT
  USING (true);

-- Authenticated users (Admins) can manage categories
CREATE POLICY "Authenticated users can manage categories"
  ON learning_categories FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 5. Trigger for updated_at (Reuse existing function if possible, or create new)
-- Assuming update_learning_updated_at exists from previous migration
CREATE TRIGGER learning_categories_updated_at
  BEFORE UPDATE ON learning_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_learning_updated_at();
