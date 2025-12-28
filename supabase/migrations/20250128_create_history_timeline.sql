-- History Timeline System Database Schema
-- Creates tables for storing historical events/videos as nodes and their relationships as edges

-- 1. History Nodes Table (Events/Videos)
CREATE TABLE IF NOT EXISTS history_nodes (
  id BIGSERIAL PRIMARY KEY,
  
  -- Content
  title TEXT NOT NULL,
  date DATE,
  year INTEGER,
  description TEXT,
  youtube_url TEXT,
  category TEXT DEFAULT 'general',
  tags TEXT[] DEFAULT '{}',
  
  -- ReactFlow Position
  position_x FLOAT DEFAULT 0,
  position_y FLOAT DEFAULT 0,
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. History Edges Table (Relationships/Connections)
CREATE TABLE IF NOT EXISTS history_edges (
  id BIGSERIAL PRIMARY KEY,
  
  -- Connection
  source_id BIGINT NOT NULL REFERENCES history_nodes(id) ON DELETE CASCADE,
  target_id BIGINT NOT NULL REFERENCES history_nodes(id) ON DELETE CASCADE,
  
  -- Relationship Info
  relation_type TEXT DEFAULT 'related', -- 'influenced', 'evolved', 'contemporary', 'related'
  label TEXT, -- Description shown on the edge
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent duplicate edges
  UNIQUE(source_id, target_id)
);

-- 3. Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_history_nodes_created_by ON history_nodes(created_by);
CREATE INDEX IF NOT EXISTS idx_history_nodes_category ON history_nodes(category);
CREATE INDEX IF NOT EXISTS idx_history_nodes_year ON history_nodes(year);
CREATE INDEX IF NOT EXISTS idx_history_nodes_date ON history_nodes(date);
CREATE INDEX IF NOT EXISTS idx_history_edges_source ON history_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_history_edges_target ON history_edges(target_id);

-- 4. Updated At Trigger
CREATE OR REPLACE FUNCTION update_history_nodes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER history_nodes_updated_at
  BEFORE UPDATE ON history_nodes
  FOR EACH ROW
  EXECUTE FUNCTION update_history_nodes_updated_at();

-- 5. RLS (Row Level Security) Policies
ALTER TABLE history_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE history_edges ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read
CREATE POLICY "Anyone can view history nodes"
  ON history_nodes FOR SELECT
  USING (true);

CREATE POLICY "Anyone can view history edges"
  ON history_edges FOR SELECT
  USING (true);

-- Only authenticated users can create
CREATE POLICY "Authenticated users can create nodes"
  ON history_nodes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can create edges"
  ON history_edges FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only creators or admins can update/delete
CREATE POLICY "Creators can update their nodes"
  ON history_nodes FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Creators can delete their nodes"
  ON history_nodes FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Creators can update their edges"
  ON history_edges FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by);

CREATE POLICY "Creators can delete their edges"
  ON history_edges FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- 6. Comments for Documentation
COMMENT ON TABLE history_nodes IS 'Stores historical events/videos as nodes for the timeline visualization';
COMMENT ON TABLE history_edges IS 'Stores relationships between history nodes';
COMMENT ON COLUMN history_nodes.position_x IS 'X coordinate for ReactFlow canvas';
COMMENT ON COLUMN history_nodes.position_y IS 'Y coordinate for ReactFlow canvas';
COMMENT ON COLUMN history_edges.relation_type IS 'Type of relationship: influenced, evolved, contemporary, related';
COMMENT ON COLUMN history_edges.label IS 'Description text shown on the connection line';
