CREATE TABLE IF NOT EXISTS public.scraped_events (
  id text PRIMARY KEY,
  keyword text,
  source_url text,
  poster_url text,
  extracted_text text,
  structured_data jsonb,
  is_collected boolean DEFAULT false,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
