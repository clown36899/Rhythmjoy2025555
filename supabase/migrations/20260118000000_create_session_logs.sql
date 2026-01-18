-- Create session_logs table for tracking user sessions
CREATE TABLE IF NOT EXISTS session_logs (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT UNIQUE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    fingerprint TEXT,
    is_admin BOOLEAN DEFAULT FALSE,
    
    -- Session timing
    session_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_end TIMESTAMPTZ,
    duration_seconds INTEGER,
    
    -- Entry/Exit tracking
    entry_page TEXT,
    exit_page TEXT,
    referrer TEXT,
    
    -- UTM parameters
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    
    -- Activity metrics
    total_clicks INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_session_logs_session_id ON session_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_session_logs_user_id ON session_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_session_logs_fingerprint ON session_logs(fingerprint);
CREATE INDEX IF NOT EXISTS idx_session_logs_session_start ON session_logs(session_start);
CREATE INDEX IF NOT EXISTS idx_session_logs_is_admin ON session_logs(is_admin);

-- RLS policies
ALTER TABLE session_logs ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to insert their own sessions
CREATE POLICY "Users can insert their own sessions"
    ON session_logs
    FOR INSERT
    WITH CHECK (true);

-- Allow all authenticated users to update their own sessions
CREATE POLICY "Users can update their own sessions"
    ON session_logs
    FOR UPDATE
    USING (true);

-- Allow admins to read all sessions
CREATE POLICY "Admins can read all sessions"
    ON session_logs
    FOR SELECT
    USING (
        (SELECT get_user_admin_status()) = true
    );
