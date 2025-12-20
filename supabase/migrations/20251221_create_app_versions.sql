-- Create a table to track released versions
CREATE TABLE IF NOT EXISTS app_versions (
    version TEXT PRIMARY KEY,
    released_at TIMESTAMPTZ DEFAULT NOW(),
    released_by UUID REFERENCES auth.users(id)
);

-- Turn on RLS
ALTER TABLE app_versions ENABLE ROW LEVEL SECURITY;

-- Allow admins to insert/select (Simpler policy for now: authenticated users can read, admins can write)
-- OR just let anyone read, but only admins write.

DROP POLICY IF EXISTS "Anyone can read versions" ON app_versions;
CREATE POLICY "Anyone can read versions" ON app_versions
    FOR SELECT USING (true);

-- Using the existing board_admins definition or just simple auth check if board_admins table exists
-- Assuming board_admins exists from previous context
DROP POLICY IF EXISTS "Admins can insert versions" ON app_versions;
CREATE POLICY "Admins can insert versions" ON app_versions
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM board_admins WHERE user_id = auth.uid()
        )
    );

-- Insert current version to prevent re-posting current one
INSERT INTO app_versions (version) VALUES ('2.2.2') ON CONFLICT DO NOTHING;
