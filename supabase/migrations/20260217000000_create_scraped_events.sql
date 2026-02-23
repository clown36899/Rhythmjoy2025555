-- Create scraped_events table for event ingestion staging
CREATE TABLE IF NOT EXISTS public.scraped_events (
    id TEXT PRIMARY KEY,
    keyword TEXT,
    source_url TEXT,
    poster_url TEXT,
    extracted_text TEXT,
    structured_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.scraped_events ENABLE ROW LEVEL SECURITY;

-- Policy: Admin can do everything
CREATE POLICY "Admin full access on scraped_events" 
ON public.scraped_events
FOR ALL
USING (
    auth.jwt() ->> 'email' = 'inteyeo@gmail.com' -- Replace with your admin email or use role check
    OR (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
)
WITH CHECK (
    auth.jwt() ->> 'email' = 'inteyeo@gmail.com'
    OR (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
);

-- Policy: Authenticated users can read (to see candidate events in UI)
CREATE POLICY "Authenticated users can select scraped_events"
ON public.scraped_events
FOR SELECT
TO authenticated
USING (true);

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_scraped_events_updated_at
BEFORE UPDATE ON public.scraped_events
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();
