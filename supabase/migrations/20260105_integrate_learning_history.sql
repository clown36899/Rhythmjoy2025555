-- Phase 1: Integrate Learning & History Data Schema

-- 기존 데이터 정리를 위해 CASCADE를 포함한 삭제 (주의: 기존 데이터가 삭제됩니다)
DROP TABLE IF EXISTS public.learning_documents CASCADE;

-- 1. Add year and timeline flag to learning_playlists
ALTER TABLE public.learning_playlists 
ADD COLUMN IF NOT EXISTS "year" INTEGER,
ADD COLUMN IF NOT EXISTS "is_on_timeline" BOOLEAN DEFAULT false;

-- 2. Create learning_documents table
CREATE TABLE IF NOT EXISTS public.learning_documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT, -- Markdown format
  "year" INTEGER,
  category_id UUID REFERENCES public.learning_categories(id) ON DELETE SET NULL,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_on_timeline BOOLEAN DEFAULT false,
  is_public BOOLEAN DEFAULT true, -- 이 컬럼이 누락되었습니다!
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_learning_playlists_year ON public.learning_playlists("year");
CREATE INDEX IF NOT EXISTS idx_learning_documents_year ON public.learning_documents("year");
CREATE INDEX IF NOT EXISTS idx_learning_documents_category_id ON public.learning_documents(category_id);

-- 4. Updated At Trigger for Documents
DROP TRIGGER IF EXISTS learning_documents_updated_at ON public.learning_documents;
CREATE TRIGGER learning_documents_updated_at
  BEFORE UPDATE ON public.learning_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_learning_updated_at();

-- 5. RLS Policies for Documents
ALTER TABLE public.learning_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view public documents"
  ON public.learning_documents FOR SELECT
  USING (true); -- Public by default for now, can be restricted later

CREATE POLICY "Authenticated users can create documents"
  ON public.learning_documents FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authors can update their documents"
  ON public.learning_documents FOR UPDATE
  TO authenticated
  USING (auth.uid() = author_id);

CREATE POLICY "Authors can delete their documents"
  ON public.learning_documents FOR DELETE
  TO authenticated
  USING (auth.uid() = author_id);

-- Comments
COMMENT ON TABLE public.learning_documents IS 'Stores markdown-based learning documents and articles';
COMMENT ON COLUMN public.learning_playlists.year IS 'Historical year associated with this playlist';
COMMENT ON COLUMN public.learning_documents.year IS 'Historical year associated with this document';
