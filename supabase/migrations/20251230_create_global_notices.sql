-- Create global_notices table
CREATE TABLE IF NOT EXISTS global_notices (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE global_notices ENABLE ROW LEVEL SECURITY;

-- Policies
-- [FIX] Allow public to select ALL notices so the frontend can check the latest status accurately
DROP POLICY IF EXISTS "Public can read active notices" ON global_notices;
CREATE POLICY "Public can read all notices for checking status" ON global_notices
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage notices" ON global_notices;
CREATE POLICY "Admins can manage notices" ON global_notices
    FOR ALL USING (is_admin_user())
    WITH CHECK (is_admin_user());

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_global_notices_updated_at ON global_notices;
CREATE TRIGGER update_global_notices_updated_at
    BEFORE UPDATE ON global_notices
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
