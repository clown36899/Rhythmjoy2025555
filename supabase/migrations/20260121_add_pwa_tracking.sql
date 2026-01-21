-- Add PWA tracking to session_logs table
ALTER TABLE session_logs
ADD COLUMN IF NOT EXISTS is_pwa BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS pwa_display_mode TEXT;

-- Create index for PWA sessions
CREATE INDEX IF NOT EXISTS idx_session_logs_is_pwa ON session_logs(is_pwa);

-- Create pwa_installs table for tracking installation events
CREATE TABLE IF NOT EXISTS pwa_installs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    fingerprint TEXT,
    
    -- Installation details
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    install_page TEXT,
    display_mode TEXT,
    
    -- Device/Browser info
    user_agent TEXT,
    platform TEXT,
    
    -- UTM tracking
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    referrer TEXT,
    
    -- Session reference
    session_id TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_pwa_installs_user_id ON pwa_installs(user_id);
CREATE INDEX IF NOT EXISTS idx_pwa_installs_fingerprint ON pwa_installs(fingerprint);
CREATE INDEX IF NOT EXISTS idx_pwa_installs_installed_at ON pwa_installs(installed_at);
CREATE INDEX IF NOT EXISTS idx_pwa_installs_session_id ON pwa_installs(session_id);

-- RLS policies
ALTER TABLE pwa_installs ENABLE ROW LEVEL SECURITY;

-- Allow all users to insert their own install events
CREATE POLICY "Users can insert their own PWA installs"
    ON pwa_installs
    FOR INSERT
    WITH CHECK (true);

-- Allow admins to read all install events
CREATE POLICY "Admins can read all PWA installs"
    ON pwa_installs
    FOR SELECT
    USING (
        (SELECT get_user_admin_status()) = true
    );

-- Comment on table
COMMENT ON TABLE pwa_installs IS 'Tracks PWA installation events for analytics';
COMMENT ON COLUMN session_logs.is_pwa IS 'Whether this session was launched from PWA (standalone mode)';
COMMENT ON COLUMN session_logs.pwa_display_mode IS 'PWA display mode: standalone, fullscreen, minimal-ui, etc.';
