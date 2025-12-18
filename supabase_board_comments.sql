-- Drop existing table if it exists (to fix schema)
DROP TABLE IF EXISTS board_comments CASCADE;

-- Create board_comments table
CREATE TABLE IF NOT EXISTS board_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id BIGINT NOT NULL,
  user_id UUID NOT NULL,
  author_name TEXT NOT NULL,
  author_nickname TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_board_comments_post_id ON board_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_board_comments_user_id ON board_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_board_comments_created_at ON board_comments(created_at DESC);

-- Enable Row Level Security
ALTER TABLE board_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Anyone can view comments
CREATE POLICY "Anyone can view comments" ON board_comments
  FOR SELECT USING (true);

-- Authenticated users can create comments
CREATE POLICY "Authenticated users can create comments" ON board_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own comments
CREATE POLICY "Users can update own comments" ON board_comments
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own comments
CREATE POLICY "Users can delete own comments" ON board_comments
  FOR DELETE USING (auth.uid() = user_id);

-- Enable realtime for comments
ALTER PUBLICATION supabase_realtime ADD TABLE board_comments;
